# pale-waves-rooms

PALE WAVES SET THE SKY のオンライン用ルームサーバー（Cloudflare Workers + Durable Objects）。
ルーム名ごとに1つの部屋ができ、入っている人どうしのデータを中継するだけのサーバーです。

- 接続先: `wss://pale-waves-rooms.<あなたのサブドメイン>.workers.dev/room/<ルーム名>`
- ブラウザで `https://pale-waves-rooms.<あなたのサブドメイン>.workers.dev/` を開いて
  「PALE WAVES rooms: OK」と出れば動いています。
