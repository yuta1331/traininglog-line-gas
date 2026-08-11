# traininglog-line-gas

LINEから筋トレ記録をスプレッドシートに登録するGoogle Apps Scriptプロジェクト。
セットアップ・ディレクトリ構成・開発コマンドはREADME.mdを参照。

## ブランチとPRの運用

- ブランチフロー: 作業ブランチ → develop → main（デフォルトブランチ）
- PR作成時は必ず本文に対象Issueを closing keyword（`Closes #X`）で書く
- Issueの自動Closeは **mainへのマージ時のみ** 発火する。develop向けPRの
  `Closes #X` はIssueとのリンク表示のみ。Closeしたい Issue は
  develop→main のリリースPR本文にまとめて `Closes #X` を書くこと
- PR本文の構成は `.github/PULL_REQUEST_TEMPLATE.md` に合わせる
