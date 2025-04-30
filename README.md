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

## 📦 構成
- TypeScript
- Webpack + gas-webpack-plugin
- Google Apps Script (clasp)
- LINE Messaging API

## 📁 ディレクトリ構成

```
.
├─┐ src/
│   ├─┐ config.ts          # 各種設定値
│   ├─┐ index.ts           # doPostエントリポイント
│   └─┐ services/
│       ├─┐ parse.ts       # 筋トレメッセージのパース
│       ├─┐ reply.ts       # LINEへの返信処理
│       ├─┐ user.ts        # ユーザー認証処理
│       ├─┐ read.ts        # スプレッドシート読取専用処理
│       └─┐ export.ts      # JSON書き出し処理
├─┐ dist/                  # ビルド後出力
├─┐ package.json
├─┐ tsconfig.json
├─┐ webpack.config.js
└─┐ .clasp.json            # GAS連携設定
```

## .gitignoreしてるけど重要なファイル
個人情報を含むため.gitignoreしていますが、以下については設定が必要です。

.clasp.json
``` json
{
  "scriptId": "GASデプロイ先",
  "rootDir": "dist",
  "scriptExtensions": [
    ".js",
    ".gs"
  ],
  "htmlExtensions": [
    ".html"
  ],
  "jsonExtensions": [
    ".json"
  ],
  "filePushOrder": [],
  "skipSubdirectories": true
}
```

src/config.ts
``` TypeScript
export const CONFIG = {
  SPREADSHEET_ID: '筋トレ記録スプレッドシートID',
  SHEET_NAME_LOG: 'TrainingLog',
  SHEET_NAME_USERS: 'User',
  JSON_FOLDER_ID: 'json格納するGoogleドライブのフォルダID',
  JSON_FILE_NAME: 'training_log.json',
  LINE_CHANNEL_ACCESS_TOKEN: 'LINE返信時に使用するトークン',
};
```

## 🛠 セットアップ手順

1. **依存インストール**

```bash
npm install
```

2. **ビルド**

```bash
npm run build
```

3. **GASへデプロイ**

```bash
npm run deploy
```

---

## 📝 メッセージフォーマット例

```
4/26 A店
dワンハンドロウ 24:12,24:10,24:8,22:8
mシーテッドロウアンダー 59:9,56:9,54:10
m懇垂 0:8,5:9,9:8
mリアデルト 36:10,34:10,34:8
dハンマーカール 10:7,9:6,7:7
```

（1行目は日付＋店舗名必須）
（种目ごとに「重量: 回数」をカンマ区切りで記述）

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

## 🔑 注意事項
- `.clasp.json`の`rootDir`は`dist`になっています
- LINEのチャネルアクセストークンは`src/config.ts`に設定してください

---

# 🏋️️‍♂️ Let's keep training and logging!!
