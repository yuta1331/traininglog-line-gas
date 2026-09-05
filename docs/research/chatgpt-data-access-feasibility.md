# ChatGPTから筋トレ記録を参照する経路の事前調査

調査日: 2026-09-05。判断チケット作成前の事前調査。方式の採択・動作確認は未実施。

## 結論

DBをBigQueryに変えるだけでは、ChatGPTプロジェクトの手動同期が不要になるとは確認できない。保存先と、相談時に記録を取得する経路は別の判断とする。まず現在のChatGPTアカウントで、Google Driveの接続ツールによるSheet再取得が「プロジェクトのソースの手動同期」を代替するか確かめる価値がある。これは調査からの提案であり、現環境での成功を確認したものではない。

DB直結が必要なら、MCPまたはGPT Actionsを通して相談時に記録を取得する構成は公式資料に基づく候補になる。ただし開発・認証・ホスティング・利用プランの確認が必要。追加費用0円を現時点で保証できる候補はない。

## ユーザーが確認した現在の運用と目標

- 現在はChatGPTプロジェクトのソースでDrive連携を利用し、最新化には手動同期が必要。
- 記録は公式LINE、相談はChatGPTで継続する。
- LINEへの記録後、転送や同期の操作なしに最新の記録を使えることを目標とする。
- 自分専用から将来は少人数の知人利用へ広げる。追加費用0円が理想。
- 利用中のChatGPTプラン、Web・モバイル・デスクトップの主利用面、具体的なソース追加方法は未確認。

上記は今回のユーザー発言を正本とする。一般的な製品仕様とは区別する。

## 公式資料で確認できたこと

| 項目 | 確認内容 | 根拠 |
| --- | --- | --- |
| Projects | プロジェクトにはアップロードしたファイルと接続コンテキストを置くSourcesがあり、同じプロジェクト内にChatとChatGPT Workの会話を置ける。プロジェクト内会話でファイル・指示・接続ソースを共有する。 | [Projects and chats](https://learn.chatgpt.com/docs/projects) |
| Google Drive接続ツール | 現行のPlugins資料は、Google DriveプラグインでDrive・Docs・Sheets・Slidesを扱えると説明。コネクタは外部サービスを読む／操作するツールを公開する。 | [Plugins](https://learn.chatgpt.com/docs/plugins) |
| 利用面 | Plugins資料はChat・WorkでWeb・デスクトップ・モバイルに対応すると説明。ただしアカウントで利用可能なプラグインであること、接続認証が必要。 | [Plugins](https://learn.chatgpt.com/docs/plugins) |
| プロジェクト内のプラグイン | Projects資料はWebのプロジェクトでChatGPT Workからプラグインを利用する導線を記載。通常Chat内の個別プラグイン利用についてはPlugins資料の一般説明との組み合わせになるため、ユーザーの実画面で確認する。 | [Projects and chats](https://learn.chatgpt.com/docs/projects), [Plugins](https://learn.chatgpt.com/docs/plugins) |
| 自作MCP | 公開HTTPSまたはSecure MCP Tunnel経由で接続でき、Developer modeで登録して会話からツール選択を試験する。Developer modeの可否はアカウント・ワークスペースの方針に依存する。 | [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt) |
| MCPの認証 | ユーザー認証とツール権限にOAuthを利用し、サーバーが各要求のトークンとアプリ固有ポリシーを検証する。 | [Authenticate users](https://developers.openai.com/plugins/build/auth) |
| GPT Actions | Custom GPTに設定し、自然言語の相談からREST APIを呼び、データウェアハウスを含む外部データを取得できる。 | [GPT Actions](https://developers.openai.com/api/docs/actions/introduction) |
| DB向けActions | DB照会に必要ならRESTの中間APIを用意する。OpenAI側からAPIに到達できる必要がある。読み取り用サービスアカウントの利用も検討対象としている。 | [Data retrieval with GPT Actions](https://developers.openai.com/api/docs/actions/data-retrieval) |

## 同期という言葉を分ける

1. **DBから分析用Sheetへの更新**: アプリ側で作る派生データ更新処理。採用DB・更新方法の仕様が必要。
2. **プロジェクトのSourcesに追加したDriveファイルの更新**: ユーザーが現在手動操作している部分。今回開いたProjects資料にはGoogle Drive固有の更新方式・遅延・再同期方法がなく、自動更新の可否を確定できない。
3. **Driveの検索・読み取りツールを相談時に呼ぶこと**: 現行Plugins資料で外部サービスの読み取り能力は確認できた。ただしすべての読取が常に最新バージョンを返す保証、インデックス同期との関係、Sheetの全行取得上限までは確認できない。
4. **MCP接続画面のRefresh**: 公式資料が説明するのはツール名・スキーマ・認証・UI等のメタデータを変更した後の更新。筋トレ行を追加するたびにこのRefreshが必要という意味ではない。[Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)

したがって「Driveを同期できるから、プロジェクトソースも自動で最新になる」「BigQuery→Sheetを自動更新すればChatGPTの手動同期も消える」は現段階では採用できない説明。

## 比較する候補

| 候補 | 利用者の操作案 | 利点・検証する境界 |
| --- | --- | --- |
| DB→分析用Sheet→Driveツールで取得 | 初回に個人用ファイルを接続し、以後ChatGPTで相談 | 現運用に近い。分析用Sheetは期間・集計により有界にできるという設計案。Sheet更新とChatGPT読取の両方で新鮮さを実測する。通常Chatのプロジェクト、スマホ、現在のプランで使えるか確認する。 |
| DB→専用MCP→ChatGPT | 初回認証後、筋トレ用ツールで相談 | 相談時点のDB照会を自作できる。プロジェクト内・スマホでの利用可否、個人配布方法、認証基盤とホスティング無料枠を確認する。 |
| DB→REST API→Custom GPT Actions | 初回に専用GPTを開き認証して相談 | DB検索が公式の想定用途。既存プロジェクトにおけるCustom GPTの利用・会話継続、利用者/作者の契約要件は今回の資料では未確認。プロジェクトの代替になると断言しない。 |

上の「利用者の操作案」は設計上の想定であり、検証済みの手順ではない。MCPやActionsで直接検索する場合でも、必要な期間・種目・集計だけを返し、回答には取得日時と対象範囲を示す設計が考えられる。全履歴を毎回読み込む必要はない。これは提案であり、対応する分析要件の確認を待つ。

## 次の判断に必要な実環境確認

1. 現在のChatGPTプランと主な相談端末を確認する。
2. 現プロジェクトに置くテスト用Sheetで、読取結果を取得する。
3. Sheetに識別しやすいテスト行を追加し、Sourcesの同期を操作せず、同じプロジェクトからDriveのツールを明示して再取得する。取得値・取得日時・ツール経路を記録する。
4. 既存会話／新規会話、追加／訂正で挙動を比較する。成功しても全条件での即時反映保証とはしない。
5. この経路で要件を満たせない場合に、自作MCP・Actionsを狭い読み取り操作で比較する。

知人対応では個人ごとのファイル権限または認証済みユーザーに基づくAPI側の絞り込みを要件にする。ユーザーIDをプロンプトに書くだけの分離を設計の根拠にしない。OAuthに加えアプリ固有の権限検査をサーバーが行うことは[MCP認証資料](https://developers.openai.com/plugins/build/auth)でも明記されている。

## 調査の限界

OpenAI Docsスキルが指定する `developers.openai.com`・`platform.openai.com`・`learn.chatgpt.com` を検索し、該当ページの本文を開いて確認した。Help Centerは同スキルの許可ドメインに含まれないため使用していない。従来の「Google Drive with sync」のプラン一覧、同期間隔、Projectsでの例外を今回の根拠から確認できなかった。現在のアカウントでの接続・同期検証も行っていない。

現行の[Pricing](https://learn.chatgpt.com/docs/pricing)はChatGPT WorkとCodexの共有利用枠を説明するが、Google Drive同期・Developer mode・Custom GPT作成/利用の要件を本件向けに確定できる表ではなかった。既存契約だけで利用できるか、知人にも有料契約が必要かは未確定。ChatGPT本体の利用料と、連携サーバー・認証基盤・DBの費用は個別に確認する。
