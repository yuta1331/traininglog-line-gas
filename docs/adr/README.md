# Architecture Decision Records

構造に関する決定と、**その決定に至った理由**を残す。コードを読んでも分からないこと（なぜ他の選択肢を採らなかったか、何が技術的に不可能だったか）を書く場所。

## 何を書くか

- 後から「なぜこうなっていないのか」と聞かれる決定
- 検討して**採らなかった**選択肢と、その理由
- 環境の制約で**実装できない**と判明したこと（これが一番価値が高い。書かないと誰かが同じ調査を繰り返す）

逆に、コードや issue を読めば分かることは書かない。「今はやらない」だけの先送りは issue で足りる。

## 書き方

- ファイル名は `NNNN-短い説明.md`（連番、欠番を作らない）
- ステータスは `Proposed` / `Accepted` / `Superseded by ADR-NNNN`
- 決定を覆すときは既存の ADR を書き換えず、新しい ADR を足して古い方を `Superseded` にする

## 一覧

- [ADR-0001](0001-doPost-thin-adapter.md) — `doPost` を薄い adapter にし、メッセージ処理を messageHandler と記録ストアに分ける
- [ADR-0002](0002-webhook-signature-verification-not-possible-on-gas.md) — Webhook の署名検証は素の Google Apps Script では実装できない
- [ADR-0003](0003-ci-only-no-cd.md) — CIのみ導入し、CDは当面入れない
