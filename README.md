# Line Training Log Bot

LINEから筋トレ記録をスプレッドシートに登録するGoogle Apps Script (GAS) Botです！

## 🏗 実装済み機能

- LINEからのメッセージ受信
- 指定ユーザーのみ許可（スプレッドシートにリスト管理）
- 筋トレ記録メッセージパース＆登録
- トップセット（最重量＆最多Rep）自動判定
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
│       ├─┐ lineApi.ts          # LINE Messaging APIへのPOSTを担うadapter
│       ├─┐ reply.ts            # LINEへの返信処理（lineApi経由）
│       └─┐ markAsRead.ts       # 受信メッセージの自動既読処理（lineApi経由）
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
d. 以下の6つのプロパティを設定：

| プロパティ名 | 説明 | 例 |
|:------------|:-----|:---|
| `SPREADSHEET_ID` | スプレッドシートのID | `1a2b3c4d5e6f...` |
| `SHEET_NAME_LOG` | トレーニングログシート名 | `TrainingLog` |
| `SHEET_NAME_USERS` | 許可ユーザーリストシート名 | `UserList` |
| `JSON_FOLDER_ID` | JSON出力先のGoogleドライブフォルダID | `1x2y3z4a5b6c...` |
| `JSON_FILE_NAME` | 出力するJSONファイル名 | `training_data.json` |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINEチャネルアクセストークン | `your_channel_access_token` |

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

## ✅ CI

`master`・`develop`への push と、それらを対象とする Pull Request で GitHub Actions（`.github/workflows/ci.yml`）が動きます。

1. `npm ci`
2. `npm run typecheck`（`tsc --noEmit -p tsconfig.typecheck.json`。`src/`・`test/`の両方が対象）
3. `npm test`（vitest）
4. `npm run build`（`tsconfig.json`。ビルド対象は`src/`のみ）

Node のバージョンは `.nvmrc`（ローカル開発環境と同じ`22.15.0`）を参照します。

デプロイ（`npm run deploy` / `clasp push`）はCIに含まれません。ローカルから手動で行う運用のままです（理由は[ADR-0003](docs/adr/0003-ci-only-no-cd.md)）。

CIが落ちている状態でのマージを防ぎたい場合は、GitHubリポジトリの Settings → Branches で `master`・`develop` に対して「Require status checks to pass before merging」を設定してください（この設定自体はリポジトリ管理者が行う必要があります）。

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
| 7  | トップセット | 最重量＆最多Repなら「1」 |

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
※ トップセットは最重量＆最多Repのセットに "topSetFlag": 1 が付きます。

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
