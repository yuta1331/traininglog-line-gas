# BigQuery 移行候補の事前調査

確認日: 2026-09-05。Google の公式一次資料のみ。Wayfinder の判断材料であり、BigQuery 採用の決定ではない。クラウド設定・実データ・課金設定は確認していない。

## 結論

BigQuery は GAS から書き込め、Sheets での分析にも接続できる候補。ただし「課金設定なしの恒久保存」「Connected Sheets のセル編集だけで DB も修正」は成立しない。通常の BigQuery の無料枠内で運用する方式と、最近分の修正を反映する別処理を評価する必要がある。以下の事実からの設計上の推論で、採用可否は未決定。

## 確認できた事実

### 無料枠と sandbox は別

| 項目 | sandbox | 課金を有効にした通常利用 |
| --- | --- | --- |
| 支払情報 | カード・請求先アカウント不要 | プロジェクトの課金を有効にする |
| 保存の無料枠 | **生涯累計 10 GiB。削除しても枠は復活しない** | 最初の 10 GiB/月が無料 |
| クエリの無料枠 | 処理量 1 TiB/月 | 処理量の最初の 1 TiB/月が無料 |
| 自動失効 | テーブル・ビュー・パーティションは 60 日で失効 | sandbox から移る場合は既存の失効設定を変更する必要あり |
| DML / streaming | 非対応 | 利用可能、方式別の料金・制約あり |

出典: [sandbox 制限とアップグレード](https://docs.cloud.google.com/bigquery/docs/sandbox)、[BigQuery 料金・無料枠](https://cloud.google.com/bigquery/pricing#free-usage-tier)。特に sandbox の保存枠は、古い記事の「10 GB の無料保存」という説明だけでは判断しない。

通常利用でも無料枠超過分は課金対象。取り込み方式も別勘定で、共有スロットによる通常の batch load は無料だが、Storage Write API (REST、旧 `tabledata.insertAll`) は $0.01/200 MiB、各行最低 1 KB とされる。Storage Write API (gRPC) は月の最初の 2 TiB が無料。保存・分析の無料枠があることから、すべての書き込みが無料とは推定できない。[料金表](https://cloud.google.com/bigquery/pricing)

### Sheets 連携は分析用で、直接の書き戻しではない

Connected Sheets は BigQuery にクエリを実行し、その結果を Sheets に保持する。手動またはスケジュールで更新できる。基本要件は GCP と BigQuery へのアクセス、必要な権限、課金設定済みプロジェクト（試用環境の例外あり）。公式ヘルプは **Sheets 内から BigQuery のデータは変更できない**と明記する。[利用要件と操作](https://support.google.com/docs/answer/9702507?hl=en)

個人 Google アカウントへの提供は公式に案内されており、「Connected Sheets には有料 Workspace が必須」とは扱わない。管理組織のアクセス制御・ユーザーの実際の画面は未確認。[個人アカウントを含む提供範囲](https://workspaceupdates.googleblog.com/2022/05/use-connected-sheets-with-vpc-sc-protected-data.html)

推論: 「最近の記録だけを普通の編集用 Sheet に表示し、修正を GAS で BigQuery に反映する」は別途設計できる。ただし Connected Sheets の標準機能だけでは完成せず、対象レコードの ID、編集権限、更新競合、反映失敗の扱いを決める必要がある。

### GAS からの記録と修正

Apps Script の BigQuery Advanced Service は、データのアップロードとクエリ実行に対応。公式サンプルには `BigQuery.Jobs.query` と Blob を送る `BigQuery.Jobs.insert` の load job がある。Advanced Service の有効化が必要。[Apps Script BigQuery Service](https://developers.google.com/apps-script/advanced/bigquery)

BigQuery は SQL の `INSERT` / `UPDATE` / `DELETE` を実行できる。ただし REST streaming で追加した直近 30 分の行は DML で更新できない。gRPC で追加した直近行は更新可能。[DML と直近行の制約](https://docs.cloud.google.com/bigquery/docs/data-manipulation-language)

旧 `tabledata.insertAll` は現在の公式文書で Storage Write API (REST) と呼ばれる。課金有効化が必要で、Google は新規プロジェクトに gRPC 版を推奨する。[REST streaming](https://docs.cloud.google.com/bigquery/docs/write-api-rest)

Google の性能ガイドは、単一行ごとの DML よりバッチを推奨し、BigQuery を分析向けと位置付ける。少人数の低頻度記録を禁止する記述ではないが、LINE の投稿ごとに低遅延で確定・直後に誤記を修正する使い方との適合は実測が必要。[単一行 DML のガイド](https://docs.cloud.google.com/bigquery/docs/best-practices-performance-compute#avoid_dml_statements_that_update_or_insert_single_rows)

推論: GAS から load job または DML を使う案を評価できる。gRPC を GAS から直接使えることは今回確認しておらず、無料 streaming 枠だけを理由にその実装を前提にしない。保存受付と完了通知、再送時の重複防止、直後の訂正を検証項目にする。

### 「0 円保証」と「無料枠内運用」

BigQuery にはクエリ単位の `maximumBytesBilled`、日次のプロジェクト・ユーザー別クエリ枠がある。前者は実行前見積りが上限超過なら課金せず失敗させる。これらはクエリ費の制御で、保存や別サービスの全費用を 0 円にする保証ではない。[クエリ費用の制御](https://docs.cloud.google.com/bigquery/docs/best-practices-costs)、[日次カスタム枠](https://docs.cloud.google.com/bigquery/docs/custom-quotas)

通知のみの予算は自動停止しない。新しい Spend caps（Preview）も公式の対象サービス一覧に BigQuery は含まれていない。[予算通知](https://docs.cloud.google.com/billing/docs/how-to/budgets)、[Spend caps の対象と制約](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)

したがって今回の候補は「課金を有効にし、選んだ API と利用量を無料枠内に抑える運用」であり、「課金設定なしで何年でも記録を保存できる方式」とは区別する。

## 未確認・残る判断

- 2026-09-05 の追加回答で、ユーザーは請求先を登録して無料枠内で運用する方針と、超過時の課金可能性を許容した。0 円は目標であり、厳密な無課金保証は要件ではない。BigQuery の採用自体は未決定。
- 現在のデータ量、投稿数、増加量、既存の GCP 利用による無料枠消費。今回の情報だけで無料枠内を確約しない。
- 誤記修正の期間と即時性。直後の訂正が必要なら取り込み方式の選択に影響する。
- 編集用 Sheets の更新と、ChatGPT プロジェクトの Drive ソースの最新化は別経路。BigQuery→Sheets の自動更新だけで ChatGPT が必ず最新版を見ることは今回確認していない。
- 各利用者が自分の記録だけを参照・修正できる認可方式、GAS の実行時間・失敗時の体験、既存ログ移行と検証。
