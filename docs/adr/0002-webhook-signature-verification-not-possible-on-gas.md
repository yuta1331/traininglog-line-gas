# ADR-0002: Webhook の署名検証は素の Google Apps Script では実装できない

- ステータス: Accepted
- 日付: 2026-08-11

## 背景

LINE の Messaging API は Webhook リクエストに `X-Line-Signature` **HTTPヘッダー**を付ける。受信側はチャネルシークレットで署名を検証し、リクエストが LINE から来たことを確認するのが正規の手順。

本プロジェクトはこれを行っていない。現在の認可は `allowedUserIds.includes(userId)` のみで、この `userId` はリクエストボディから取り出した値である。

## 決定

**現時点では実装しない。** ただしこれは優先度の判断ではなく、**現在の構成では実装手段が存在しない**ためである。

Google Apps Script のウェブアプリの `doPost(e)` は、HTTPリクエストヘッダーに一切アクセスできない。`e` が持つのは `parameter` / `parameters` / `pathInfo` / `contentLength` / `postData` のみで、ヘッダーを読むAPIは提供されていない。署名がヘッダーで届く以上、素の GAS では検証しようがない。

**この ADR を書く目的はこの1点にある。** これが残っていないと、ヘッダーを読む方法を探す調査が繰り返される。

## 実装するときの選択肢

1. **前段に薄いプロキシを置く** — Cloud Functions / Cloudflare Workers 等で `X-Line-Signature` を検証し、通過したリクエストだけを GAS の Webhook URL へ転送する。正攻法。インフラが1つ増える。
2. **Webhook URL のクエリパラメータに秘密トークンを載せる** — GAS 側は `e.parameter` で照合できる。LINE 公式の署名検証とは別物の妥協策であり、URL が漏れれば無意味になることを理解した上で採る必要がある。

どちらも [ADR-0001](0001-doPost-thin-adapter.md) で `doPost` が薄い adapter になったことで、差し込み位置は明確になっている。

## 関連

- 方式の決定は #32 → 上記の選択肢2を採用した（[ADR-0004](0004-webhook-token-and-rotation.md)）。**本 ADR の「ヘッダーが読めない」という事実は覆っていない**ため、ステータスは `Accepted` のまま据え置く
