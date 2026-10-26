// PALE WAVES SET THE SKY — online rooms.
// Each room name is one Durable Object; every player in it holds one WebSocket to it.
// The room only passes messages on: each player's latest "presence" (their state) goes to everyone else.
// Who runs the match is still decided in the game (by join order, handed out here), so the server stays tiny.
//   wss://<this worker>/room/<name>
//   client → server: {"t":"p","d":<presence>}      (and {"t":"ping"}, answered without waking the room)
//   server → client: {"t":"hi","id","seq","all":{id:presence},"seqs":{id:seq}}   on joining
//                    {"t":"p","id","d"} · {"t":"seq","id","n"} · {"t":"bye","id"}
import { DurableObject } from "cloudflare:workers";

const MAX_MSG = 12 * 1024;   // one presence (the match state is about 2 KB)
const MAX_PEERS = 16;
const NAME = /^[a-z0-9_-]{1,48}$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/room\/([^/]+)$/);
    if (!m) return new Response("PALE WAVES rooms: OK", { headers: { "content-type": "text/plain; charset=utf-8" } });
    const name = decodeURIComponent(m[1]).toLowerCase();
    if (!NAME.test(name)) return new Response("bad room name", { status: 400 });
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected a WebSocket", { status: 426 });
    return env.ROOMS.get(env.ROOMS.idFromName(name)).fetch(req);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.pres = new Map();   // id → latest presence (kept in memory; everyone re-sends theirs many times a second)
    try { this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}')); } catch (e) {}
  }
  async fetch(req) {
    const here = this.ctx.getWebSockets();
    if (here.length >= MAX_PEERS) return new Response("room full", { status: 429 });
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    let seq = 0; const all = {}, seqs = {};
    for (const ws of here) {
      const a = ws.deserializeAttachment(); if (!a) continue;
      if (a.seq >= seq) seq = a.seq + 1;   // join order: the first one here is 0 (it runs the match)
      seqs[a.id] = a.seq; all[a.id] = this.pres.has(a.id) ? this.pres.get(a.id) : null;
    }
    seqs[id] = seq;
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, seq });
    server.send(JSON.stringify({ t: "hi", id, seq, all, seqs }));
    this.send({ t: "seq", id, n: seq }, server);
    return new Response(null, { status: 101, webSocket: client });
  }
  send(msg, except) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) { try { ws.send(s); } catch (e) {} }
  }
  async webSocketMessage(ws, data) {
    if (typeof data !== "string" || data.length > MAX_MSG) return;
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || m.t !== "p") return;
    const a = ws.deserializeAttachment(); if (!a) return;
    this.pres.set(a.id, m.d);
    this.send({ t: "p", id: a.id, d: m.d }, ws);
  }
  gone(ws) {
    const a = ws.deserializeAttachment(); if (!a || a.gone) return;   // (close and error can both come: say bye once)
    a.gone = true; try { ws.serializeAttachment(a); } catch (e) {}
    this.pres.delete(a.id);
    this.send({ t: "bye", id: a.id }, ws);
  }
  async webSocketClose(ws, code) { this.gone(ws); try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch (e) {} }
  async webSocketError(ws) { this.gone(ws); }
}
