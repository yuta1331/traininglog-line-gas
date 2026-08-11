# ADR-0003: CIのみ導入し、CDは当面入れない

- ステータス: Accepted
- 日付: 2026-08-11

## 背景

GitHub Actions での自動検証（`npm ci` → `tsc --noEmit` → `vitest run` → `npm run build`）を導入するにあたり、そのままデプロイまで自動化する（CD）かどうかを検討した。

## 決定

**CIのみ導入する。CDは入れない。** デプロイ（`npm run deploy` = `clasp push`、および本番Webアプリのデプロイ更新）は従来どおりローカルから手動で行う。

理由は2つある。

1. **認証情報をGitHub Secretsに置きたくない。** `clasp push` にはGoogleのOAuthトークン（`~/.clasprc.json`）が要る。CI上で自動デプロイするにはこれをGitHub Secretsに置く必要があり、その管理・漏洩リスクを避けるという判断。
2. **`clasp push` だけでは本番に反映されない。** `clasp deployments` を実行すると `@HEAD`（pushで即時反映）と、バージョン固定の `@N` が両方存在した。LINE Developersコンソールの実際のWebhook URL（`https://script.google.com/macros/s/<デプロイID>/exec`）と突き合わせたところ、本番で使われているのは**バージョン固定側**だった。デプロイIDそのものは本番Webhook URLの一部であり、これを知っていれば認可（[ADR-0002](0002-webhook-signature-verification-not-possible-on-gas.md)により署名検証がなく `userId` 照合のみ）を回避してリクエストを送れてしまうため、`.clasp.json` をgitignoreしているのと同じ理由でここには書かない。

   つまり `clasp push`（HEADの更新）だけでは本番のコードは変わらない。反映には、Apps Scriptエディタで対象デプロイをバージョン固定で更新する手動操作が必須（[README「8. ウェブアプリのデプロイ（手動）」](../../README.md)参照）。CDを組むなら「pushするだけ」では済まず、デプロイの向き先を新バージョンに更新する操作（Apps Script APIの `deployments.update` 相当）まで自動化する必要があり、その分スコープと必要な認証が広がる。今回はここまで踏み込まない。

## 誤って前提にしかけたこと

CI導入の検討初期、「本番はHEADデプロイ運用（`clasp push` だけで本番に反映される）」という前提で話が進みかけたが、これは誤りだった。`clasp deployments` の出力だけでは `@HEAD` とバージョン固定のどちらが本番Webhookに使われているか分からず、LINE Developersコンソールの実際のWebhook URLと突き合わせて初めて「バージョン固定」だと確定した。

**この節を書く目的はこの1点にある。** `clasp deployments` の出力に `@HEAD` の行があっても、それが本番で使われているとは限らない。将来この事実を再検証するときは、Webhook URLとの突き合わせを省略しないこと。

## 採らなかった選択肢

- **CIと同時にCDも導入する** — 上記2つの理由により見送り。将来CDを設計する際は、GitHub Secretsでの認証情報管理方針と、デプロイのバージョン更新の自動化方法を別途検討する必要がある。

## 結果

- `.github/workflows/ci.yml` が `master`・`develop` への push と、それらを対象とするPull Requestで動く
- デプロイ手順（`npm run deploy` の実行と、Apps Scriptエディタでのデプロイのバージョン更新）はREADME記載のまま、ローカル手動で継続

## 関連

- [ADR-0001](0001-doPost-thin-adapter.md)
