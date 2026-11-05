# jdf-mcp
Japan Domestic Flight MCP Server

公共交通オープンデータセンター (ODPT) が配布する JAL・ANA の国内線フライト時刻表をもとに、路線ごとの時刻表を返す MCP サーバーです。Hono で実装し、Cloudflare Workers 上で Streamable HTTP (`/mcp`) として動きます。

## 構成

```
Cron Trigger (6 時間ごと) ── ODPT ダンプ API ── 正規化 ──▶ Workers KV (timetable/v1)
                                                              │
MCP クライアント ── POST /mcp ── isolate 内キャッシュ ◀───────┘
```

- ODPT のダンプ (約 12MB) を取得し、国内線だけを曜日ごとにまとめた運航パターン (約 1.8MB) にして KV に置きます。
- リクエスト時は KV から読み、isolate 内に 5 分キャッシュします。KV が空 (初回デプロイ直後など) なら、そのリクエストの中で作ります。
- KV の読み書きに失敗しても、手元にあるデータで応答します。作成に失敗した isolate は、1 分間は作り直さずにエラーを返します。
- **Workers Paid プランが必要です。** ダンプの取得と正規化に CPU 時間を数百 ms 使い、無料プランの上限 (10ms) を超えるためです。

## ローカルで動かす

```sh
npm install
cp .dev.vars.example .dev.vars   # ODPT_CONSUMER_KEY に ODPT のアクセストークンを設定
npm run dev                      # http://localhost:8787/mcp
curl "http://localhost:8787/__scheduled?cron=15+*/6+*+*+*"   # Cron の処理を手動で実行
```

## デプロイ

```sh
npx wrangler login
npx wrangler secret put ODPT_CONSUMER_KEY
npm run deploy                   # KV namespace は初回デプロイで作成される
```

`odpt.team-syn.com` を Custom Domain として割り当てています ([wrangler.jsonc](wrangler.jsonc) の `routes`)。DNS レコードと証明書はデプロイ時に作られるため、team-syn.com のゾーンが同じ Cloudflare アカウントにある必要があります。

Claude Code から使う場合:

```sh
claude mcp add --transport http jdf https://odpt.team-syn.com/mcp
```

`/mcp` に認証はありません。URL を知っていれば誰でも呼べるので、必要なら Cloudflare Access やレート制限を前段に置いてください。

## ツール

| ツール | 内容 |
|---|---|
| `search_airports` | 空港コード・都市・日本語名・英語名から空港を探す |
| `list_routes` | 空港発着の路線一覧と、航空会社ごとの便数・始発・最終・所要時間 |
| `get_route_timetable` | 2 空港間の、指定日の全便 (時刻・所要時間・機材・運航会社) |
| `get_flight` | 便名 (コードシェア便名も可) から、指定日の運航と運航パターン |
| `get_data_info` | データの出典・ライセンス・更新日時・航空会社ごとの提供期間 |

- 空港は `HND` のようなコードのほか、`TYO` / `OSA` / `SPK` の都市コードや「羽田」「札幌」のような名前でも指定できます。都市は複数の空港に展開します。
- 日付を省略すると JST の今日として扱います。時刻はすべて JST です。

## データについて

- 通常の API (`odpt:FlightSchedule?odpt:operator=...`) は 1000 件で打ち切られるため、全件入りのダンプ API (`odpt:FlightSchedule.json`) を使います。
- ODPT のデータは「運航会社 × 出発空港 × 到着空港 × 曜日」単位です。日付を指定されると、曜日・便ごとの有効期間・JAL の備考 (`odpt:note`) を突き合わせてその日に飛ぶ便を求めます。
- JAL の備考には「10/1-24・5分遅発(到着は同時刻)」「7/1-16・運休」「FDA機材及び乗員にて運航」のような日付ごとの例外が書かれており、[src/timetable/note.ts](src/timetable/note.ts) で解釈して適用します。
- ANA のデータには国際線も含まれるため、国内空港の一覧 ([src/timetable/airports.ts](src/timetable/airports.ts)) で国内線だけに絞っています。
- 航空会社ごとにデータの提供期間が異なります。期間外の日付を指定すると、レスポンスの `warnings` で知らせます。
- 運賃・空席・リアルタイムの運航状況は含みません。

データは[公共交通オープンデータ基本ライセンス](https://developer.odpt.org/terms)に従って利用しています。

## 開発

```sh
npm test             # vitest (Node 上で実行。KV と ODPT への fetch は差し替える)
npm run typecheck
npm run cf-typegen   # wrangler.jsonc の compatibility_date を変えたら Workers の型を作り直す
```

正規化済みデータの形 ([src/timetable/snapshot.ts](src/timetable/snapshot.ts)) を変えたら `SNAPSHOT_FORMAT_VERSION` を上げてください。KV のキーが変わり、デプロイ後の最初のリクエストで新しい形式のデータが作られます。
