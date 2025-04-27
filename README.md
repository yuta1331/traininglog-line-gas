# Line Training Log Bot

LINEから筋トレ記録をスプレッドシートに登録するGoogle Apps Script (GAS) Botです！

## 📦 構成
- TypeScript
- Webpack + gas-webpack-plugin
- Google Apps Script (clasp)
- LINE Messaging API # comming soon

## 📁 ディレクトリ構成

```
.
├─┐ src/
│   ├─┐ config.ts          # 各種設定値
│   ├─┐ index.ts           # doPostエントリポイント
│   └─┐ services/
│       ├─┐ parse.ts       # 筋トレメッセージのパース
│       ├─┐ reply.ts       # LINEへの返信処理、未実装
│       └─┐ user.ts        # ユーザー認証処理
├─┐ dist/                  # ビルド後出力
├─┐ package.json
├─┐ tsconfig.json
├─┐ webpack.config.js
└─┐ .clasp.json            # GAS連携設定
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

## 🏗 実装済み機能

- LINEからのメッセージ受信
- 指定ユーザーのみ許可（スプレッドシートにリスト管理）
- 筋トレ記録メッセージパース＆登録
- トップセット（最重量＆最多Rep）自動判定
- メッセージフォーマットチェック

## 🚧 実装予定
- LINEへカジュアルな返信

## 📝 メッセージフォーマット例

```
4/26 処店
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

---

## 🔑 注意事項
- `.clasp.json`の`rootDir`は`dist`になっています
- LINEのチャネルアクセストークンは`src/config.ts`に設定してください

---

# 🏋️️‍♂️ Let's keep training and logging!!


