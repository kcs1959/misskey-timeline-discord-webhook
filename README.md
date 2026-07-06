# misskey-timeline-discord-webhook

Misskey のストリーミング API でタイムラインを購読し、新着ノートを Discord Webhook に転送するツールです。

## 必要なもの

- Misskey インスタンスの URL
- Discord の Incoming Webhook URL
- （`homeTimeline` / `hybridTimeline` を使う場合）Misskey の API トークン

## 環境変数

| 変数                       | 必須     | 説明                                                             |
| -------------------------- | -------- | ---------------------------------------------------------------- |
| `MISSKEY_ORIGIN`           | はい     | Misskey の URL（例: `https://misskey.example.com`）              |
| `DISCORD_WEBHOOK_URL`      | はい     | Discord Webhook URL                                              |
| `MISSKEY_TOKEN`            | 条件付き | API トークン。`homeTimeline` / `hybridTimeline` では必須         |
| `TIMELINE`                 | いいえ   | 購読するチャンネル（既定: `localTimeline`）                      |
| `WITH_RENOTES`             | いいえ   | リノートを含める（既定: `true`）                                 |
| `WITH_REPLIES`             | いいえ   | 返信を含める（`localTimeline` / `hybridTimeline`、既定: `true`） |
| `WITH_FILES`               | いいえ   | 添付ファイル情報を Discord に含める（既定: `true`）              |
| `FORWARD_CW`               | いいえ   | CW 付きノートを転送する（既定: `true`）                          |
| `FORWARD_NSFW`             | いいえ   | NSFW（`isSensitive`）添付を含むノートを転送する（既定: `false`） |
| `FORWARD_REPLIES`          | いいえ   | 返信ノートを Discord に転送する（既定: `true`）                  |
| `DEDUP_MAX`                | いいえ   | 重複排除で記録するノート ID 数の上限（既定: `1000`）             |
| `DISCORD_QUEUE_MAX`        | いいえ   | Discord 送信キューの上限（既定: `500`）                          |
| `DISCORD_SEND_INTERVAL_MS` | いいえ   | Discord 送信間隔（ミリ秒、既定: `2000`）                         |

真偽値の環境変数（`WITH_RENOTES` など）は `true` または `1` のとき真、それ以外は偽です。

`TIMELINE` に指定できる値:

- `localTimeline` — ローカルタイムライン（LTL）
- `globalTimeline` — グローバルタイムライン（GTL）
- `homeTimeline` — ホームタイムライン（要トークン）
- `hybridTimeline` — ソーシャルタイムライン（要トークン）

## Docker で実行

```bash
cp .env.example .env
# .env を編集

docker compose up --build
```

Docker の healthcheck は Misskey ストリームへの接続状態を `/tmp/healthy` で判定します。`Dockerfile` と `docker-compose.yml` の両方で定義されています。ローカル実行（`npm run dev`）では healthcheck は使われません。

## ローカルで実行

```bash
cp .env.example .env
# .env を編集

npm ci
npm run dev   # 開発（ホットリロード）
# または
npm run build && npm start
```

## Discord への送信形式

- 投稿者のアイコン・表示名を Webhook の `username` / `avatar_url` に設定
- 返信ノートには返信先ノートへのリンクを付与
- ノート本文・CW・引用リノートをテキストで送信
- 投票付きノートは選択肢を番号付きリストで送信（得票数付き）
- CW 付きノートの本文は Discord のスポイラー（`||...||`）で隠す
- 通常画像は embed、それ以外のファイルはリンクとして送信
- NSFW（`isSensitive`）画像は **embed にせず**、スポイラー付きリンクのみ送信（Discord の embed では画像スポイラーが効かないため）
- ノート URL を末尾に付与
- embed 上限（10 件）を超えた添付はリンクとして本文に追記
- username（80 文字）・embed title（256 文字）・embed 合計文字数（6000 文字）を超える場合は切り詰めまたはリンク化

### 信頼性

- 転送に成功したノートのみ重複排除の対象にする（失敗時は再送可能）
- CW / NSFW / 返信フィルタでスキップしたノートも重複排除の対象にする（再接続時の再判定を省略）
- `DEDUP_MAX` を超えた古いノート ID はメモリ節約のため破棄される。Misskey が再接続時に古いノートを再送すると、再転送される可能性がある
- Discord 送信は設定可能な間隔のレート制限と 429 / 5xx リトライ付きキューで処理（400 など恒久的な 4xx は即失敗）
- Discord Webhook 送信には 30 秒のタイムアウトがある
- キュー上限（既定 500 件）に達した場合、新着ノートはログと累計破棄数を残して破棄する

### コンテンツフィルタ

| 変数              | `false` のとき                              |
| ----------------- | ------------------------------------------- |
| `FORWARD_CW`      | CW 付きノート（引用リノート含む）をスキップ |
| `FORWARD_NSFW`    | NSFW 添付を含むノートをスキップ             |
| `FORWARD_REPLIES` | 返信ノートをスキップ                        |

`WITH_REPLIES` は Misskey ストリームに返信イベントを含めるかどうか、`FORWARD_REPLIES` は受信した返信ノートを Discord に転送するかどうかを制御します。

`WITH_FILES` は Discord に送るメッセージに添付ファイル（embed・リンク）を含めるかどうかを制御します。Misskey ストリーミング API の `withFiles` パラメータ（ファイル付きノートのみ受信するフィルタ）とは別物で、このツールはストリームには送信しません。

Discord は NSFW コンテンツに厳しいため、`FORWARD_NSFW` の既定値は `false` です。`true` にしても NSFW 画像は embed 表示されず、スポイラー付きリンクに置き換わります。

MFM の装飾（太字・リンクなど）は Discord 向けに変換せず、Misskey のテキストをそのまま送ります。

Misskey のドライブ URL が短命・認証付きの場合、Discord 側で画像 embed が表示されないことがあります。
