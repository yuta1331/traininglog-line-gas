# 技術的詳細分析：処理フローとタイミング

## 📊 現在の処理フロー分析

### 1. doPost関数の実行フロー

```
┌─────────────────────────────────────────────────────────────┐
│ LINE Webhook POST リクエスト受信                              │
└───────────────────────┬─────────────────────────────────────┘
                        │ t=0ms
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ doPost開始                                                    │
│ - JSON.parse(e.postData.contents)                           │
│ - events配列の取得                                            │
└───────────────────────┬─────────────────────────────────────┘
                        │ t=10-50ms
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ スプレッドシート取得（TrainingLog）                            │
│ - SpreadsheetApp.openById()                                 │
│ - getSheetByName()                                          │
└───────────────────────┬─────────────────────────────────────┘
                        │ t=300-800ms ⚠️
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 許可ユーザー読み込み（loadAllowedUserIds）                     │
│ - SpreadsheetApp.openById()                                 │
│ - getSheetByName()                                          │
│ - getDataRange().getValues()                                │
└───────────────────────┬─────────────────────────────────────┘
                        │ t=500-1500ms ⚠️⚠️
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ forEach(event) ループ開始                                     │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
┌──────────────────┐          ┌──────────────────┐
│ 通常メッセージ   │          │ json書き出し     │
└────────┬─────────┘          └────────┬─────────┘
         │                             │
         ▼                             ▼
┌──────────────────┐          ┌──────────────────────────┐
│ メッセージパース │          │ loadTrainingRecords()    │
│ parseTrainingLog │          │ - getDataRange()         │
└────────┬─────────┘          │ - 全行読み込み           │
         │                    └────────┬─────────────────┘
         │ t=50-100ms                  │ t=2000-5000ms ⚠️⚠️⚠️
         ▼                             ▼
┌──────────────────┐          ┌──────────────────────────┐
│ appendRow() 実行 │          │ convertRecordsToJson()   │
│ （セット数分）   │          │ - データ変換             │
└────────┬─────────┘          └────────┬─────────────────┘
         │                             │ t=500-1500ms ⚠️
         │ t=200-1000ms/行 ⚠️         ▼
         ▼                    ┌──────────────────────────┐
┌──────────────────┐          │ saveJsonToDrive()        │
│ replyToUser()    │          │ - ファイル検索           │
│ - LINE API呼出し │          │ - ファイル削除           │
└────────┬─────────┘          │ - 新規作成               │
         │                    │ - 権限設定               │
         │ t=500-2000ms ⚠️⚠️  └────────┬─────────────────┘
         │                             │ t=1000-3000ms ⚠️⚠️⚠️
         │                             ▼
         │                    ┌──────────────────────────┐
         │                    │ replyToUser()            │
         │                    │ - LINE API呼出し         │
         │                    └────────┬─────────────────┘
         │                             │ t=500-2000ms ⚠️⚠️
         └─────────────┬───────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ forEach終了                                                   │
└───────────────────────┬─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ HTTPレスポンス返却                                             │
│ ContentService.createTextOutput({ status: 'ok' })           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼ t=合計時間
┌─────────────────────────────────────────────────────────────┐
│ 通常メッセージ: 1,550-5,450ms                                 │
│ → 2秒以内にレスポンス返却できない ⚠️⚠️ タイムアウト！        │
│ JSON書き出し: 4,800-14,300ms                                 │
│ → 2秒以内にレスポンス返却できない ⚠️⚠️⚠️ タイムアウト！      │
└─────────────────────────────────────────────────────────────┘
```

**重要**: LINE Webhookは**2秒以内に2xxレスポンス**が必要です。処理全体が10秒かかっても、最初の2秒以内にレスポンスを返せばタイムアウトしません。

### ⏱️ 処理時間の見積もり

#### ケース1: 通常のトレーニング記録（3セット）

```
項目                              最小時間    最大時間    平均時間
────────────────────────────────────────────────────────────
JSONパース                         10ms       50ms        30ms
スプレッドシート取得（Log）        300ms      800ms       550ms
ユーザー認証（全行読み込み）       500ms     1500ms      1000ms
メッセージパース                    50ms      100ms        75ms
appendRow × 3回                    600ms     3000ms      1800ms
LINE返信API                        500ms     2000ms      1250ms
────────────────────────────────────────────────────────────
合計                              1960ms     7450ms      4705ms
```

⚠️ **結果**: 2秒を超える可能性が高い → **request_timeoutエラー**

**重要**: 処理全体は10秒以内だが、**2秒以内にレスポンスを返せない**ためタイムアウトする

#### ケース2: 大量セット記録（10セット）

```
項目                              最小時間    最大時間    平均時間
────────────────────────────────────────────────────────────
JSONパース                         10ms       50ms        30ms
スプレッドシート取得（Log）        300ms      800ms       550ms
ユーザー認証（全行読み込み）       500ms     1500ms      1000ms
メッセージパース                    50ms      100ms        75ms
appendRow × 10回                  2000ms    10000ms      6000ms
LINE返信API                        500ms     2000ms      1250ms
────────────────────────────────────────────────────────────
合計                              3360ms    14450ms      8905ms
```

⚠️⚠️ **結果**: 2秒を大きく超過 → **request_timeoutエラー確実**

#### ケース3: JSON書き出し（データ1000行）

```
項目                              最小時間    最大時間    平均時間
────────────────────────────────────────────────────────────
JSONパース                         10ms       50ms        30ms
スプレッドシート取得（Log）        300ms      800ms       550ms
ユーザー認証（全行読み込み）       500ms     1500ms      1000ms
loadTrainingRecords（1000行）     2000ms     5000ms      3500ms
convertRecordsToJson              500ms     1500ms      1000ms
saveJsonToDrive                   1000ms     3000ms      2000ms
LINE返信API                        500ms     2000ms      1250ms
────────────────────────────────────────────────────────────
合計                              4810ms    13850ms      9330ms
```

⚠️⚠️⚠️ **結果**: 2秒を大きく超過 → **request_timeoutエラー確実**

**注意**: 早期レスポンス返却を実装すれば、処理が10秒以上かかってもタイムアウトしません。

---

## 🔍 コード詳細分析

### 問題1: スプレッドシート操作の重複

**現状:**
```typescript
// index.ts (25-28行目)
const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
  .getSheetByName(CONFIG.SHEET_NAME_LOG);

// index.ts (30行目) - user.ts経由
const allowedUserIds = loadAllowedUserIds();
  // ↓ user.ts内で再度openById()
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    .getSheetByName(CONFIG.SHEET_NAME_USERS);
```

**問題点:**
- 同じスプレッドシートに2回アクセス
- 各 `openById()` で約300-800ms消費
- 最適化により500-1000ms削減可能

---

### 問題2: appendRowの非効率な使用

**現状（index.ts 67-77行目）:**
```typescript
records.forEach(record => {
  sheet.appendRow([
    record.userId,
    record.date,
    record.shop,
    record.event,
    record.weight,
    record.reps,
    record.topSet ? 1 : ''
  ]);
});
```

**問題点:**
- 各 `appendRow()` で個別のAPI呼び出し
- 10セットの場合、10回のAPI呼び出し
- 各呼び出しで約200-1000ms

**改善案:**
```typescript
// 全レコードを1回で書き込み
const rows = records.map(record => [
  record.userId,
  record.date,
  record.shop,
  record.event,
  record.weight,
  record.reps,
  record.topSet ? 1 : ''
]);
sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
```

**効果:** 10セットの場合、約2000-9000ms → 300-800ms に短縮

---

### 問題3: ユーザー認証の毎回読み込み

**現状（user.ts）:**
```typescript
export function loadAllowedUserIds(): string[] {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    .getSheetByName(CONFIG.SHEET_NAME_USERS);
  const values = sheet.getDataRange().getValues();
  return values.slice(1).map(row => row[0]).filter(id => !!id);
}
```

**問題点:**
- Webhook受信のたびに全ユーザーリスト読み込み
- ユーザーリストが変更されることは稀
- キャッシュ可能なデータ

**改善案:**
```typescript
export function loadAllowedUserIds(): string[] {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('allowedUserIds');
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    .getSheetByName(CONFIG.SHEET_NAME_USERS);
  const values = sheet.getDataRange().getValues();
  const userIds = values.slice(1).map(row => row[0]).filter(id => !!id);
  
  // 10分間キャッシュ
  cache.put('allowedUserIds', JSON.stringify(userIds), 600);
  
  return userIds;
}
```

**効果:** 2回目以降のアクセスで約500-1500ms → 10-50ms に短縮

---

### 問題4: JSON書き出しの全データ読み込み

**現状（export.ts）:**
```typescript
export function loadTrainingRecords(): TrainingLogRow[] {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    .getSheetByName(CONFIG.SHEET_NAME_LOG);
  const values = sheet.getDataRange().getValues();
  // 全データを配列に変換
  const records: TrainingLogRow[] = values.slice(1).map(row => { ... });
  return records;
}
```

**問題点:**
- データが1000行あると、読み込みだけで2-5秒
- JSON変換でさらに0.5-1.5秒
- Drive保存でさらに1-3秒
- 合計4.5-9.5秒 + その他処理 = **確実にタイムアウト**

**根本的な問題:**
- doPost内で同期的に実行すべきではない処理
- 非同期処理（時間ベーストリガー等）で実行すべき

---

### 問題5: LINE返信の同期実行

**現状（index.ts + reply.ts）:**
```typescript
// index.ts
replyToUser(replyToken, '登録したよ！💪');

// reply.ts
export function replyToUser(replyToken: string, message: string): void {
  const url = 'https://api.line.me/v2/bot/message/reply';
  // ...
  const response = UrlFetchApp.fetch(url, options);  // 同期的に待機
  Logger.log(`Reply response: ${response.getContentText()}`);
}
```

**問題点:**
- LINE APIのレスポンスを待つ（500-2000ms）
- doPostのHTTPレスポンス返却が遅延
- LINE Webhookのタイムアウトリスクが増加

**改善案:**
```typescript
// 1. レスポンス返却を優先
// 2. 返信処理は非同期で実行（またはエラーハンドリングのみ）
export function replyToUser(replyToken: string, message: string): void {
  const url = 'https://api.line.me/v2/bot/message/reply';
  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    // ...
    muteHttpExceptions: true,  // すでに設定済み
  };
  
  try {
    UrlFetchApp.fetch(url, options);
    // レスポンスは検証しない（エラーはmute）
  } catch (e) {
    Logger.log(`Reply failed: ${e}`);
    // エラーでも処理は継続
  }
}
```

---

## 🏗️ デプロイ設定の詳細分析

### 現在の設定（appsscript.json）

```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

### executeAs の動作

#### `USER_DEPLOYING` の場合
```
┌─────────────────┐
│ LINE Webhook    │
│ POST Request    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ GAS Web App     │
│ 認証チェック    │
└────────┬────────┘
         │
    ┌────┴────┐
    │ 判定    │
    └────┬────┘
         │
    ┌────┴────────────────┐
    │                     │
    ▼                     ▼
┌───────┐          ┌──────────┐
│ OK    │          │ NG       │
│ 実行  │          │ 302      │
│       │          │ Redirect │
└───────┘          └──────────┘
```

**問題シナリオ:**
1. GASが「実行ユーザー = デプロイユーザー」の権限で実行を試みる
2. LINEからの匿名アクセスだが、デプロイユーザーの権限が必要
3. OAuth認証が未完了の場合、認証ページへ302リダイレクト
4. LINEは302を受け取り、エラーとして記録

#### `USER_ACCESSING` の場合
```
┌─────────────────┐
│ LINE Webhook    │
│ POST Request    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ GAS Web App     │
│ 匿名ユーザーで  │
│ 実行            │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ doPost 実行     │
│ （権限問題なし）│
└─────────────────┘
```

**推奨:** `executeAs: "USER_ACCESSING"` に変更

---

### access の動作

#### `ANYONE_ANONYMOUS`
- 匿名アクセス許可
- Google アカウント不要
- LINE Webhook に最適

#### `ANYONE`
- Googleアカウント必要
- ログインが必要な場合あり
- LINE Webhook には不適

**推奨:** `access: "ANYONE_ANONYMOUS"` を維持

---

## 📋 設定変更の具体的手順

### 302エラー対策

**手順1: デプロイ設定変更**

1. `src/appsscript.json` を編集:
```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_ACCESSING",  // ← 変更
    "access": "ANYONE_ANONYMOUS"
  }
}
```

2. ビルド＆デプロイ:
```bash
npm run build
npm run deploy
```

3. 新しいデプロイ作成:
   - GASエディタ → デプロイ → 新しいデプロイ
   - 種類: ウェブアプリ
   - 説明: LINE Webhook (本番)
   - 次のユーザーとして実行: 自分
   - アクセスできるユーザー: 全員
   - デプロイ

4. Webhook URL更新:
   - 新しいデプロイのURLをコピー
   - LINE Developer Console → Messaging API → Webhook URL に貼り付け
   - 更新 → 検証

---

## 🎯 エラー発生パターンのまとめ

### Pattern A: 常時302エラー

**症状:**
- すべてのWebhookで302エラー
- doPost が実行されていない

**原因:**
- デプロイ設定の問題（executeAs: USER_DEPLOYING）
- または、テストデプロイURLの期限切れ

**対策:**
- appsscript.json の修正
- 本番デプロイの作成

---

### Pattern B: 散発的302エラー

**症状:**
- 時々302エラーが発生
- 成功することもある

**原因:**
- OAuth トークンの期限切れ
- GASの内部エラーによる一時的なリダイレクト

**対策:**
- デプロイ設定の見直し
- エラーログの詳細確認

---

### Pattern C: JSON書き出し時のみタイムアウト

**症状:**
- 通常メッセージは成功
- 「json書き出し」でタイムアウト

**原因:**
- 全データ読み込み + 変換 + Drive保存で10秒超過

**対策:**
- JSON書き出しを非同期処理に変更
- または、トリガーで定期実行

---

### Pattern D: 大量セット記録でタイムアウト

**症状:**
- 3-5セットは成功
- 10セット以上でタイムアウト

**原因:**
- appendRow の複数回実行による遅延

**対策:**
- setValues() によるバッチ書き込み

---

### Pattern E: ランダムなタイムアウト

**症状:**
- 同じメッセージでも成功/失敗が分かれる

**原因:**
- スプレッドシートのサイズ増加
- GASコールドスタート
- ネットワーク遅延

**対策:**
- キャッシュの活用
- 処理の最適化
- 早期レスポンス返却

---

## ✅ 調査結果サマリー

### 302エラー
- **主原因**: デプロイ設定（executeAs: USER_DEPLOYING）
- **発生条件**: 認証が必要と判断された場合
- **影響**: Webhookが実行されない

### request_timeout エラー
- **主原因**: 処理時間の累積（特にJSON書き出し）
- **発生条件**: 処理時間 > 10秒
- **影響**: Webhookが中断される可能性

### 共通課題
- LINE Webhook のベストプラクティス未実装
- 早期レスポンス返却が行われていない
- 同期処理中心の設計

---

**分析完了**: 2025年11月15日
