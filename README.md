# misskey-timeline-discord-webhook

Misskey のストリーミング API でタイムラインを購読し、新着ノートを Discord Webhook に転送するツールです。

## 必要なもの

- Misskey インスタンスの URL
- Discord の Incoming Webhook URL
- （`homeTimeline` / `hybridTimeline` を使う場合）Misskey の API トークン

## 環境変数

| 変数                  | 必須     | 説明                                                             |
| --------------------- | -------- | ---------------------------------------------------------------- |
| `MISSKEY_ORIGIN`      | はい     | Misskey の URL（例: `https://misskey.example.com`）              |
| `DISCORD_WEBHOOK_URL` | はい     | Discord Webhook URL                                              |
| `MISSKEY_TOKEN`       | 条件付き | API トークン。`homeTimeline` / `hybridTimeline` では必須         |
| `TIMELINE`            | いいえ   | 購読するチャンネル（既定: `localTimeline`）                      |
| `WITH_RENOTES`        | いいえ   | リノートを含める（既定: `true`）                                 |
| `WITH_REPLIES`        | いいえ   | 返信を含める（`localTimeline` / `hybridTimeline`、既定: `true`） |
| `WITH_FILES`          | いいえ   | 添付ファイル情報を含める（既定: `true`）                         |
| `FORWARD_CW`          | いいえ   | CW 付きノートを転送する（既定: `true`）                          |
| `FORWARD_NSFW`        | いいえ   | NSFW（`isSensitive`）添付を含むノートを転送する（既定: `false`） |

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
- ノート本文・CW・引用リノートをテキストで送信
- CW 付きノートの本文は Discord のスポイラー（`||...||`）で隠す
- 通常画像は embed、それ以外のファイルはリンクとして送信
- NSFW（`isSensitive`）画像は **embed にせず**、スポイラー付きリンクのみ送信（Discord の embed では画像スポイラーが効かないため）
- ノート URL を末尾に付与

### CW / NSFW のフィルタ

| 変数           | `false` のとき                              |
| -------------- | ------------------------------------------- |
| `FORWARD_CW`   | CW 付きノート（引用リノート含む）をスキップ |
| `FORWARD_NSFW` | NSFW 添付を含むノートをスキップ             |

Discord は NSFW コンテンツに厳しいため、`FORWARD_NSFW` の既定値は `false` です。`true` にしても NSFW 画像は embed 表示されず、スポイラー付きリンクに置き換わります。

MFM の装飾（太字・リンクなど）は Discord 向けに変換せず、Misskey のテキストをそのまま送ります。
