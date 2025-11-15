# LINE Webhookエラー原因調査レポート

**調査日**: 2025年11月15日  
**対象**: LINE Developer Webhook エラー（302, request_timeout）  
**調査範囲**: ソースコード分析、設定確認、技術的課題の特定（コード修正なし）

---

## 📋 調査対象システム概要

### システム構成
- **プラットフォーム**: Google Apps Script (GAS)
- **API**: LINE Messaging API (Webhook)
- **言語**: TypeScript (Webpack + gas-webpack-plugin でビルド)
- **エントリポイント**: `doPost` 関数
- **データストア**: Google Spreadsheet

### ファイル構成
```
src/
├── index.ts              # doPostエントリポイント
├── config.ts             # スクリプトプロパティ取得
├── appsscript.json       # GASデプロイ設定
└── services/
    ├── user.ts           # ユーザー認証
    ├── parse.ts          # メッセージパース
    ├── reply.ts          # LINE返信処理
    └── export.ts         # JSON出力処理
```

---

## 🔍 主要発見事項

### 1. 302エラー（リダイレクト）の原因候補

#### 1.1 **デプロイ設定の問題**（最有力）

**現在の設定（appsscript.json）:**
```json
{
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

**問題点:**
- `executeAs: "USER_DEPLOYING"` により、アクセス時に実行ユーザーの認証が要求される可能性がある
- `access: "ANYONE_ANONYMOUS"` は匿名アクセスを許可しているが、`executeAs` との組み合わせで予期しない動作が発生する可能性

**302エラーが発生するシナリオ:**
1. LINE WebhookがGAS WebアプリにPOSTリクエストを送信
2. `executeAs: "USER_DEPLOYING"` の設定により、認証チェックが発生
3. 認証が必要と判断され、Google認証ページへ302リダイレクト
4. LINE側は302レスポンスを受け取り、エラーとして記録

**推奨設定:**
```json
{
  "webapp": {
    "executeAs": "USER_ACCESSING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```
または
```json
{
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE"
  }
}
```

#### 1.2 **デプロイバージョンの問題**

**想定される問題:**
- テストデプロイとして公開している場合、URLが変更される可能性
- 古いデプロイバージョンのURLを使用している場合、新バージョンへリダイレクト
- デプロイの公開状態が「HEAD」になっている場合の動作不安定

**確認事項:**
- ✅ デプロイタイプ: 「新しいデプロイ」として公開されているか
- ✅ バージョン: 固定バージョンを使用しているか
- ✅ URL: LINE Developer Console に設定されているWebhook URLが最新か

---

### 2. request_timeout エラーの原因候補

#### 2.1 **処理時間超過**（最有力）

**LINE Messaging API の制約:**
- **Webhookレスポンスタイムアウト**: 10秒
- GASがこの時間内にHTTPレスポンスを返さない場合、request_timeoutエラーが記録される

**現在のコードで時間がかかる処理:**

##### ① **スプレッドシート読み取り（ユーザー認証）**
```typescript
// user.ts - loadAllowedUserIds()
const values = sheet.getDataRange().getValues();
```
- ユーザーリストが大量の場合、読み込みに時間がかかる
- **イベント毎に実行される**（毎回全データ読み込み）

##### ② **トレーニング記録の書き込み**
```typescript
// index.ts - doPost()
records.forEach(record => {
  sheet.appendRow([...]);  // 1行ずつ追加
});
```
- `appendRow` を複数回呼び出すと、APIコール回数が増加
- 大量のセット記録がある場合、書き込み時間が累積

##### ③ **JSON書き出し処理**
```typescript
// export.ts - saveJsonToDrive()
const records = loadTrainingRecords();  // 全データ読み込み
const jsonData = convertRecordsToJson(records);
const fileUrl = saveJsonToDrive(jsonData);
```
- 全トレーニング記録を読み込み → JSON変換 → Drive保存
- データ量が多い場合、10秒を超える可能性が高い

##### ④ **LINE返信処理の同期実行**
```typescript
// reply.ts - replyToUser()
const response = UrlFetchApp.fetch(url, options);
```
- doPost内で同期的にLINE APIを呼び出し
- LINE APIのレスポンスを待つため、処理時間が延長

**タイムアウト発生フロー:**
```
1. LINE Webhook POST → GAS doPost開始
2. ユーザー認証（スプレッドシート読み込み）: 1-3秒
3. メッセージパース: 0.1秒
4. スプレッドシート書き込み（複数行）: 2-5秒
5. LINE返信API呼び出し: 1-2秒
6. doPost終了、HTTPレスポンス返却
   → 合計: 4-11秒
   → 10秒を超えた場合、request_timeoutエラー
```

#### 2.2 **同期的なレスポンス処理の問題**

**現在の実装:**
```typescript
// index.ts - doPost()
events.forEach((event: any) => {
  // 処理実行
  // ...
  replyToUser(replyToken, message);  // 同期的に返信
});

// 最後にレスポンス返却
return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
  .setMimeType(ContentService.MimeType.JSON);
```

**問題点:**
- LINEへの返信処理が完了するまでHTTPレスポンスを返さない
- 複数イベントの場合、順次処理するため時間が累積
- JSON書き出し処理は特に時間がかかる

#### 2.3 **スプレッドシートアクセスの競合**

**潜在的な問題:**
- 複数のWebhookが同時に到着した場合、スプレッドシートへの同時書き込み
- GASの実行インスタンス間での競合によるレイテンシ増加
- スプレッドシートのサイズが大きい場合、`getDataRange()` が遅延

---

### 3. コード実装上の技術的課題

#### 3.1 **早期レスポンス返却の欠如**

**問題:**
- doPost関数は全処理完了後にレスポンスを返す設計
- LINE Webhookのベストプラクティスは「即座に200 OKを返し、処理は非同期で実行」

**現在の実装フロー:**
```
POST受信 → 認証 → パース → DB書き込み → LINE返信 → レスポンス返却
```

**推奨フロー:**
```
POST受信 → バリデーション → 200 OK返却 | 非同期処理（認証/書き込み/返信）
```

#### 3.2 **forEach内のreturn文**

**問題箇所（index.ts 40行目）:**
```typescript
events.forEach((event: any) => {
  if (!allowedUserIds.includes(userId)) {
    Logger.log(`Unauthorized user: ${userId}`);
    return;  // forEach内のreturnは継続を意味する
  }
  // ...
});
```

**問題:**
- 未認証ユーザーでも後続のイベント処理が継続される
- 意図としては`continue`だが、forEach内では効果が薄い

#### 3.3 **エラーハンドリングの不完全性**

**問題:**
```typescript
// index.ts 60行目 - json書き出しエラー時
} catch (error) {
  // ...
  replyToUser(replyToken, `❌ エクスポート失敗: ${error.message}`);
  return;  // forEachからのreturnは外側の処理を止めない
}
```

- エラー発生時もforEachは継続
- 最終的に200 OKが返るが、処理は完了していない可能性

---

## 📊 エラー発生条件の整理

### 302エラー発生条件

| 条件 | 可能性 | 根拠 |
|:-----|:------:|:-----|
| デプロイ設定が `executeAs: USER_DEPLOYING` | ⭐⭐⭐ | GAS公式ドキュメントで認証リダイレクトの可能性が記載 |
| テストデプロイURLを使用 | ⭐⭐⭐ | テストデプロイは再デプロイ時にURLが変更される |
| デプロイバージョンが「HEAD」 | ⭐⭐ | 自動更新されるため、認証ページへリダイレクトの可能性 |
| OAuth スコープ不足 | ⭐ | 初回アクセス時に認証画面へリダイレクト |

### request_timeout エラー発生条件

| 条件 | 可能性 | 想定処理時間 |
|:-----|:------:|:------------|
| JSON書き出し（大量データ） | ⭐⭐⭐ | 10秒以上 |
| トレーニング記録が多数（10セット以上） | ⭐⭐⭐ | 5-10秒 |
| スプレッドシートサイズが大きい（数千行） | ⭐⭐⭐ | 3-8秒 |
| 複数イベント同時処理 | ⭐⭐ | イベント数 × 処理時間 |
| LINEへの返信API遅延 | ⭐⭐ | 1-3秒 |
| GASコールドスタート | ⭐ | 2-5秒（初回実行時） |

---

## 🔬 再現手順

### 302エラーの再現

1. **デプロイ設定確認:**
   - GASエディタ → デプロイ → デプロイの管理
   - 「テストデプロイ」として公開されているか確認
   - `executeAs` 設定を確認

2. **再現手順:**
   - LINE公式アカウントにメッセージ送信
   - LINE Developer Console → Webhook統計を確認
   - 302エラーが記録されているか確認

3. **ログ確認:**
   - GAS実行ログ（Apps Script → 実行数）
   - doPostが実行されているか確認
   - 実行されていない場合、302リダイレクトが原因

### request_timeout エラーの再現

1. **大量データでのテスト:**
   - 10セット以上のトレーニング記録を送信
   ```
   4/26 test店
   dベンチ 100:10,100:9,100:8,95:10,95:9,95:8,90:10,90:9,90:8,85:10
   ```

2. **JSON書き出しテスト:**
   - 「json書き出し」メッセージを送信
   - スプレッドシートに大量データ（1000行以上）が存在する状態

3. **ログ確認:**
   - GAS実行ログで処理時間を確認
   - 10秒を超えている場合、タイムアウトの可能性

---

## 📈 LINE Developer Console 確認項目

### Webhook統計で確認すべき項目

1. **エラー発生時刻:**
   - 特定の時間帯に集中しているか
   - ランダムに発生しているか

2. **エラー種類の比率:**
   - 302エラーの割合
   - request_timeoutエラーの割合

3. **成功率:**
   - 全体の成功率
   - エラーが継続的か、散発的か

4. **イベントタイプ:**
   - どのメッセージタイプでエラーが発生しているか
   - 通常メッセージ vs JSON書き出しコマンド

### Webhook履歴で確認すべき項目

1. **リクエストボディ:**
   - イベント数
   - メッセージ内容

2. **レスポンス:**
   - ステータスコード
   - レスポンスボディ
   - レスポンス時間

3. **エラー詳細:**
   - エラーメッセージ
   - スタックトレース（あれば）

---

## 🎯 主要原因候補リスト

### 302エラーの主要原因（優先度順）

1. **⭐⭐⭐ デプロイ設定の不適切な組み合わせ**
   - `executeAs: USER_DEPLOYING` + `access: ANYONE_ANONYMOUS`
   - 認証リダイレクトが発生

2. **⭐⭐⭐ テストデプロイURLの使用**
   - URLが変更され、古いURLにアクセスするとリダイレクト

3. **⭐⭐ デプロイバージョンの管理不足**
   - 「HEAD」バージョンの使用による不安定性

### request_timeout エラーの主要原因（優先度順）

1. **⭐⭐⭐ JSON書き出し処理の実行時間超過**
   - 全データ読み込み + 変換 + Drive保存で10秒超過

2. **⭐⭐⭐ 大量セット記録の書き込み時間**
   - appendRow の複数回実行による遅延

3. **⭐⭐⭐ スプレッドシートサイズの肥大化**
   - getDataRange() の実行時間増加

4. **⭐⭐ LINE返信処理の同期実行**
   - doPost内でLINE APIレスポンスを待機

5. **⭐⭐ 早期レスポンス返却の欠如**
   - 全処理完了後にレスポンス返却

---

## 📚 参考ドキュメント

### LINE Messaging API

- [Webhook公式リファレンス](https://developers.line.biz/ja/reference/messaging-api/#webhook-event-objects)
- [Webhookベストプラクティス](https://developers.line.biz/ja/docs/messaging-api/receiving-messages/#webhook-best-practices)
  - **重要**: "Webhookサーバーは、受信したHTTPリクエストに対し、できるだけ早く200を返す必要があります"

### Google Apps Script

- [Web Apps Guide](https://developers.google.com/apps-script/guides/web)
- [Quotas and Limitations](https://developers.google.com/apps-script/guides/services/quotas)
  - **Script runtime**: 最大6分
  - **URL Fetch calls**: 1日20,000回
- [Deploying Web Apps](https://developers.google.com/apps-script/guides/web#deploying_a_script_as_a_web_app)

### 外部参考事例

- [GAS Webhook 302エラー事例](https://qiita.com/search?q=google+apps+script+webhook+302)
- [LINE Bot タイムアウト対策](https://qiita.com/search?q=LINE+bot+timeout+gas)

---

## 🚀 次のステップ（対策Issue用）

### 302エラー対策

1. ✅ デプロイ設定の変更
   - `executeAs: "USER_ACCESSING"` に変更
   - または `access: "ANYONE"` に変更

2. ✅ 本番デプロイへの切り替え
   - テストデプロイではなく「新しいデプロイ」として公開
   - 固定バージョンの使用

3. ✅ Webhook URL の更新
   - LINE Developer Console に最新URLを設定

### request_timeout エラー対策

1. ✅ 早期レスポンス返却の実装
   - バリデーション後、即座に200 OKを返す
   - 処理は非同期で継続（GASのトリガーまたはキュー使用）

2. ✅ JSON書き出し処理の非同期化
   - doPost内では受付のみ
   - 実際の処理は別トリガーで実行

3. ✅ スプレッドシート書き込みの最適化
   - appendRow の複数呼び出しを setValues() にまとめる
   - バッチ処理の実装

4. ✅ ユーザー認証のキャッシュ化
   - CacheService を使用して許可ユーザーリストをキャッシュ
   - 毎回スプレッドシート読み込みを回避

5. ✅ LINE返信処理の非同期化検討
   - doPostのレスポンス返却後に返信
   - または別プロセスで返信

---

## 📝 補足: ログ証跡の収集方法

### GAS実行ログの確認

1. **Apps Script エディタ:**
   - 左メニュー → 実行数
   - フィルタ: doPost
   - 実行時間を確認（10秒超過の有無）

2. **Cloud Logging（詳細ログ）:**
   - GCPコンソール → Logging
   - プロジェクト選択
   - フィルタ: `resource.type="app_script_function"`

### LINE Developer Console

1. **Webhook統計:**
   - LINE Developer Console
   - Messaging API設定
   - Webhook統計タブ
   - エラー率、レスポンスタイム確認

2. **Webhook履歴:**
   - 個別リクエストの詳細確認
   - リクエスト/レスポンスの内容確認

---

## ✅ 調査結論

### 302エラー
**最も可能性が高い原因**: デプロイ設定（`executeAs: USER_DEPLOYING`）による認証リダイレクト

### request_timeout エラー
**最も可能性が高い原因**: 
1. JSON書き出し処理の実行時間超過（全データ処理）
2. 早期レスポンス返却の欠如（全処理完了後にレスポンス）
3. スプレッドシート操作の累積遅延

**共通課題**: 
- Webhook処理のベストプラクティス（早期レスポンス返却）が実装されていない
- 同期処理が多く、処理時間が累積しやすい設計

---

**調査完了日**: 2025年11月15日  
**次のアクション**: 対策Issueでの実装検討
