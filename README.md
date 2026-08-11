# Line Training Log Bot

LINEから筋トレ記録をスプレッドシートに登録するGoogle Apps Script (GAS) Botです！

## 🏗 実装済み機能

- LINEからのメッセージ受信
- Webhook送信元トークンの検証・月次自動ローテーション（署名検証ではありません。詳細は後述の「🔐 送信元トークンと自動ローテーション」を参照）
- 指定ユーザーのみ許可（スプレッドシートにリスト管理）
- 筋トレ記録メッセージパース＆登録
- トップセット（0回を除く最重量＆最多Rep）自動判定
- メッセージフォーマットチェック
- LINEへカジュアルな返信
- 筋トレ記録のJSON書き出し対応
- 受信メッセージの自動既読（Chatモード ON 時のみ）

## 📦 構成
- TypeScript
- Webpack + gas-webpack-plugin
- Google Apps Script (clasp)
- LINE Messaging API

## 📁 ディレクトリ構成

```
.
├─┐ src/
│   ├─┐ appsscript.json         # GASマニフェスト（ビルド時にdist/へコピー）
│   ├─┐ config.ts               # スクリプトプロパティ取得ヘルパー（PropertiesServiceへの唯一の到達点）
│   ├─┐ index.ts                # doPostエントリポイント（HTTPの出入りだけを担う）
│   ├─┐ replyText.ts            # 処理結果をLINEへの返信文言に変換
│   └─┐ services/
│       ├─┐ parse.ts            # 筋トレメッセージのパース
│       ├─┐ messageHandler.ts   # メッセージ1通の処理フロー
│       ├─┐ trainingLogStore.ts # トレーニング記録の行スキーマ・記録ストアへの読み書き
│       ├─┐ export.ts           # JSON書き出し処理
│       ├─┐ user.ts             # ユーザー認証処理
│       ├─┐ lineApi.ts          # LINE Messaging API呼び出し（GET/POST/PUT）を担うadapter
│       ├─┐ reply.ts            # LINEへの返信処理（lineApi経由）
│       ├─┐ markAsRead.ts       # 受信メッセージの自動既読処理（lineApi経由）
│       ├─┐ webhookToken.ts     # 送信元トークンの照合・生成（ADR-0004）
│       └─┐ tokenRotation.ts    # 送信元トークンの月次自動ローテーション（ADR-0004）
├─┐ test/                       # vitestのテスト
├─┐ dist/                       # ビルド後出力（.gitignore対象）
├─┐ package.json
├─┐ tsconfig.json               # ビルド用（src/のみ）
├─┐ tsconfig.typecheck.json     # 型チェック用（src/・test/の両方）
├─┐ webpack.config.js
├─┐ .clasp.json.template        # GAS連携設定のひな形（Git管理）
└─┐ .clasp.json                 # GAS連携設定（.gitignore対象・各自で作成）
```

## .gitignoreしているファイル

| ファイル | 対応 |
|:--|:--|
| `.clasp.json` | デプロイ先のスクリプトIDを含むため除外。`.clasp.json.template` をコピーして作成します（手順は下記） |
| `dist/` | ビルド成果物。`npm run build` で生成されます |
| `node_modules/` | `npm install` で生成されます |

設定値（スプレッドシートIDやLINEチャネルアクセストークン）は**リポジトリ内のファイルではなく、GASのスクリプトプロパティで管理**します。`src/config.ts` はスクリプトプロパティを読み出すヘルパーで、機密情報を含まないためGit管理下にあります。

## 🛠 セットアップ手順

1. **依存インストール**

```bash
npm install
```

claspはグローバルインストールが必要です（`devDependencies`には含まれていません）。

```bash
npm install -g @google/clasp
```

2. **Apps Script APIの有効化**

https://script.google.com/home/usersettings で「Google Apps Script API」をONにします。OFFのままだと`clasp push`が失敗します。

3. **claspへログイン**

```bash
clasp login
```

ブラウザが開くので、GASプロジェクトを所有しているGoogleアカウントで認証します。認証情報は`~/.clasprc.json`に保存されます。

4. **`.clasp.json`の作成**

```bash
cp .clasp.json.template .clasp.json
```

コピーしたら`scriptId`を自分のGASプロジェクトのIDに書き換えます。IDはApps Scriptエディタの「プロジェクトの設定」→「スクリプト ID」から取得できます。

5. **スクリプトプロパティの設定**

Google Apps Scriptのスクリプトエディタで、以下の手順でスクリプトプロパティを設定してください：

a. Apps Scriptエディタを開く
b. 左メニューの「プロジェクトの設定」（⚙️アイコン）をクリック
c. 「スクリプトプロパティ」セクションで「スクリプト プロパティを追加」をクリック
d. 以下の7つのプロパティを設定：

| プロパティ名 | 説明 | 例 |
|:------------|:-----|:---|
| `SPREADSHEET_ID` | スプレッドシートのID | `1a2b3c4d5e6f...` |
| `SHEET_NAME_LOG` | トレーニングログシート名 | `TrainingLog` |
| `SHEET_NAME_USERS` | 許可ユーザーリストシート名 | `UserList` |
| `JSON_FOLDER_ID` | JSON出力先のGoogleドライブフォルダID | `1x2y3z4a5b6c...` |
| `JSON_FILE_NAME` | 出力するJSONファイル名 | `training_data.json` |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINEチャネルアクセストークン | `your_channel_access_token` |
| `WEBHOOK_TOKEN` | Webhook URLのクエリパラメータ`t`に載せる送信元トークン（[ADR-0004](docs/adr/0004-webhook-token-and-rotation.md)）。カンマ区切りで複数指定可（通常時は1つ、ローテーション入れ替え中は2つ）。**未設定だとBotは動きません（fail-closed）** | `3fa85f64-5717-4562-b3fc-2c963f66afa6` |

`WEBHOOK_TOKEN`の初期値は`Utilities.getUuid()`の実行結果を推奨します。⚠️ 照合処理（`src/services/webhookToken.ts`）はカンマ区切りで受付集合を作るため、**少なくともカンマを含む文字列は使えません**（トークンが分解されて照合が通らなくなり、fail-closedのためBotが全停止します）。導入手順とローテーションの仕組みは後述の「🔐 送信元トークンと自動ローテーション」を参照してください。

6. **ビルド**

```bash
npm run build
```

`src/`のTypeScriptを`dist/index.js`にバンドルし、あわせて`src/appsscript.json`（GASマニフェスト）を`dist/`へコピーします。clasp はマニフェストが無いとpushできないため、このコピーはビルドに組み込んでいます。

7. **GASへコードを反映**

```bash
npm run deploy
```

8. **ウェブアプリのデプロイ（手動）**

⚠️ `npm run deploy` は `clasp push` までで、**ウェブアプリのデプロイ版は更新されません**。バージョン固定でデプロイしている場合、pushしただけでは古いコードが配信され続けます。

Apps Scriptエディタで「デプロイ」→「デプロイを管理」から対象のデプロイを編集し、バージョンを「新バージョン」にして更新してください。既存のデプロイを更新すればウェブアプリURLは変わらないため、LINE側のWebhook URL再登録は不要です。

新規にデプロイを作成するとURLが変わり、LINE DevelopersコンソールのWebhook URLも更新が必要になる点に注意してください。

---

## 🔐 送信元トークンと自動ローテーション

Webhook URLのクエリパラメータ `t` に秘密のトークンを載せ、`doPost` の冒頭で照合しています（[ADR-0004](docs/adr/0004-webhook-token-and-rotation.md)）。**これは署名検証ではありません。** 証明できるのは「このURLを知っている送信元から来たこと」だけで、「LINEから来たこと」ではありません。

### 導入手順（無停止）

`WEBHOOK_TOKEN` が未設定だとBotは動きません（fail-closed）。素直に「デプロイ → LINE Developersコンソール更新」の順で導入すると、その間Botが完全に止まります。無停止で導入するには、以下の順序で進めてください。

1. スクリプトプロパティ `WEBHOOK_TOKEN` を設定する
2. LINE Developersコンソールで、登録済みのWebhook URLに `?t=<トークン>` を付与する。この時点で稼働中の旧コードは `e.parameter` を無視するため、何も壊れません
3. デプロイする（上記「7. GASへコードを反映」「8. ウェブアプリのデプロイ（手動）」）
4. **実メッセージで疎通確認する（省略しないこと）**
5. `setupRotationTrigger()` を1回実行する（詳細は次項）
6. トリガーの失敗通知設定を確認する（詳細は次項）

⚠️ **手順4は省略しないでください。** 実測で確認できているのは「クエリ文字列付きのWebhook URLでも実配信が届くこと」までで、**GASが`t`を`e.parameter`から実際に受け取れるかどうかはまだ実測していません**（documented behaviorではあるためリスクは極小です）。fail-closedな実装のため、万一ここが外れると全メッセージが処理されなくなり、疎通確認を省略するとそれに気づけません。

### `setupRotationTrigger()` の実行とローテーションの仕組み

Apps Scriptエディタの関数ドロップダウンから `setupRotationTrigger` を選んで実行してください。`npm run deploy`（`clasp push`）の後であれば、ウェブアプリのデプロイ版を更新する前でも実行できます。

- 何度実行してもトリガーは増えません。実行のたびに同じハンドラの既存トリガーを削除してから作り直す、冪等な実装です
- 毎月1回・深夜帯に、時間主導トリガーが `rotateWebhookToken` を実行します。動作は「`WEBHOOK_TOKEN` を旧トークンCと新トークンNの両方を受け付ける状態（`"C,N"`）に更新 → LINE側のWebhook URLをN入りのものに`PUT`で更新 → キャッシュ伝播を待つ → `WEBHOOK_TOKEN` を`"N"`のみに刈り取る」という順序です

**トリガーの通知設定を確認してください。** ローテーションが失敗すると `rotateWebhookToken` が例外で終了し、GASがオーナー宛に失敗通知メールを送ります。**これが唯一の検知経路です**（LINEのpush通知は採用していません。通知経路自体がローテーション失敗と同じ依存＝LINE APIを持ってしまうためです）。トリガーの通知設定は既定で「日次ダイジェスト」になっている場合があるため、「今すぐ通知」への変更を推奨します（必須ではありません。失敗時に残る`"C,N"`は構造上安全でBotは動き続けるため、通知が遅れてもローテーションの衛生の問題であり、可用性の問題にはなりません）。

### ⚠️ Webhookの再送機能を有効にしないでください

GASのウェブアプリは302で `script.googleusercontent.com` にリダイレクトしますが、**LINEはこのリダイレクトを追いません。** そのため、LINEから見ると本プロジェクトへの配信は毎回「失敗」しています（Webhook URLの「検証」ボタンも`302 Found`で失敗しますが、実際のメッセージ配信は正常に届いています）。

LINEのWebhook再送は「ボットサーバーが2xxを返さなかったとき」に発動する機能です。そのため**再送を有効にすると、全メッセージが再送され、トレーニング記録が重複登録されます。**

LINE公式・第三者の解説記事はいずれも再送の有効化を推奨しているため、今後これを踏んでしまう可能性が高いです。**現状のコードのまま有効にしないでください。**

ただし、これは原理的に不可能というわけではありません。重複排除に使う`webhookEventId`と`deliveryContext.isRedelivery`はリクエストボディに含まれるため、GASからでも読み取れます。再送を有効にしたい場合は、重複排除の実装が前提条件になります（詳細は[ADR-0004](docs/adr/0004-webhook-token-and-rotation.md)）。

---

## ✅ CI

`main`・`develop`への push と、それらを対象とする Pull Request で GitHub Actions（`.github/workflows/ci.yml`）が動きます。

1. `npm ci`
2. `npm run typecheck`（`tsc --noEmit -p tsconfig.typecheck.json`。`src/`・`test/`の両方が対象）
3. `npm test`（vitest）
4. `npm run build`（`tsconfig.json`。ビルド対象は`src/`のみ）

Node のバージョンは `.nvmrc`（ローカル開発環境と同じ`22.15.0`）を参照します。

デプロイ（`npm run deploy` / `clasp push`）はCIに含まれません。ローカルから手動で行う運用のままです（理由は[ADR-0003](docs/adr/0003-ci-only-no-cd.md)）。

CIが落ちている状態でのマージを防ぎたい場合は、GitHubリポジトリの Settings → Branches で `main`・`develop` に対して「Require status checks to pass before merging」を設定してください（この設定自体はリポジトリ管理者が行う必要があります）。

---

## 📝 メッセージフォーマット例

```
4/26 A店
dワンハンドロウ 24:12,24:10,24:8,22:8
mシーテッドロウアンダー 59:9,56:9,54:10
m懸垂 0:8,5:9,9:8
mリアデルト 36:10,34:10,34:8
dハンマーカール 10:7,9:6,7:7
```

（1行目は日付＋店舗名必須）
（種目ごとに「重量: 回数」をカンマ区切りで記述）

## 📂 スプレッドシートカラム構成

| No | 項目        | 説明                         |
|:--:|:------------|:-----------------------------|
| 1  | ユーザーID  | LINEユーザーID               |
| 2  | 日付        | 記録されたトレーニング日      |
| 3  | 店舗名      | トレーニングした店舗名         |
| 4  | 種目名      | トレーニング種目              |
| 5  | 重量        | 重量（kgなど）                |
| 6  | 回数        | Rep数                        |
| 7  | トップセット | 0回を除く最重量＆最多Repなら「1」 |

## 👤 ユーザーシート（UserList）カラム構成

`SHEET_NAME_USERS` で指定するシートの構成です。1行目はヘッダー行として扱われ、コードが読み込むのは2行目以降のA列のみです（`src/services/user.ts`）。

| 列 | 項目 | 説明 |
|:--:|:-----|:-----|
| A  | LINEユーザーID | 許可するユーザーのLINEユーザーID |
| B  | ロール（`管理者` / `ユーザー`） | 運用上のメモです。**許可判定には使われません**（コードが参照するのはA列のみです） |

B列が空欄・表記揺れのままでも許可判定（A列の一致）には影響しません。ロールを許可判定に使わない設計上の理由は[ADR-0004](docs/adr/0004-webhook-token-and-rotation.md)「採らなかった選択肢」を参照してください。

## 📤 JSON書き出し機能
LINEで json書き出し とメッセージを送ると、スプレッドシートの記録をJSON形式で出力し、Googleドライブに保存されたファイルのリンクが返信されます。

🔁 フロー
1. 許可ユーザーが json書き出し と送信
2. GASがスプレッドシートのデータを読み込む
3. トレーニング日・店舗・種目ごとに整理されたJSONを生成
4. Googleドライブ上にJSONファイルを保存（同名ファイルは置き換え）
5. ダウンロードリンクをLINEで返信

🗂 JSON構造例
``` json
[
  {
    "date": "2025-04-26",
    "location": "A店",
    "exercises": [
      {
        "name": "dワンハンドロウ",
        "sets": [
          { "weight": 24, "reps": 12, "topSetFlag": 1 },
          { "weight": 24, "reps": 10, "topSetFlag": 0 },
          { "weight": 24, "reps": 8, "topSetFlag": 0 },
          { "weight": 22, "reps": 8, "topSetFlag": 0 }
        ]
      }
    ]
  }
]
```
※ トップセットは0回を除く最重量＆最多Repのセットに "topSetFlag": 1 が付きます。0回のセットしか無い種目には付きません。

---

## 👀 自動既読機能
許可ユーザーからメッセージを受信すると、[メッセージ既読API](https://developers.line.biz/ja/docs/messaging-api/mark-as-read/)を呼び出して自動的に既読を付けます。

🔁 フロー
1. Webhookイベントの `events[].message.markAsReadToken` を取得
2. 許可ユーザーであることを確認
3. `POST https://api.line.me/v2/bot/chat/markAsRead` にトークンを送信して既読化

⚠️ 有効化の条件

`markAsReadToken` は **LINE公式アカウントマネージャーの「応答設定」でチャットがONの場合のみ** Webhookイベントに含まれます。OFFの場合はトークンが届かないため、既読処理はスキップされます（ログに `markAsReadToken is not available. Skipping mark as read.` が出力されます）。

追加のスクリプトプロパティは不要で、既存の `LINE_CHANNEL_ACCESS_TOKEN` をそのまま使用します。

---

## 🔑 注意事項
- `.clasp.json`の`rootDir`は`dist`になっています
- 設定値はすべてGoogle Apps Scriptのスクリプトプロパティで管理します
- スクリプトプロパティの設定方法は上記「セットアップ手順」を参照してください

### デプロイ時に認証エラーが出た場合

`npm run deploy`が以下のエラーで失敗することがあります。

```
{"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)"}
```

Googleが機微なスコープに対して定期的に再認証を要求するためで、`~/.clasprc.json`のトークンが失効した状態です。再ログインすれば解消します。

```bash
clasp login
```

解消しない場合は`clasp logout`で認証情報を破棄してから再度ログインしてください。

---

# 🏋️️‍♂️ Let's keep training and logging!!
