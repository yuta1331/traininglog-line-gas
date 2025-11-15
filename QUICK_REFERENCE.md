# LINE Webhook エラー調査 - クイックリファレンス

## 🚨 エラー概要

| エラータイプ | HTTP コード | 意味 | 影響 |
|:------------|:-----------|:-----|:-----|
| **302** | 302 Found | リダイレクト | Webhookが実行されない |
| **request_timeout** | - | タイムアウト | 処理が10秒以内に完了しない |

---

## 🎯 302エラー - 即座に確認すべき項目

### ✅ チェックリスト

1. **appsscript.json の設定確認**
   ```json
   {
     "webapp": {
       "executeAs": "USER_DEPLOYING",  // ← これが原因の可能性大
       "access": "ANYONE_ANONYMOUS"
     }
   }
   ```

2. **デプロイタイプ**
   - [ ] テストデプロイを使っていないか？
   - [ ] 本番デプロイ（新しいデプロイ）を作成済みか？

3. **Webhook URL**
   - [ ] LINE Developer Console の URL は最新か？
   - [ ] URLは `https://script.google.com/macros/s/...` 形式か？

### 🔧 対策

```json
// appsscript.json を以下に変更
{
  "webapp": {
    "executeAs": "USER_ACCESSING",  // ← ここを変更
    "access": "ANYONE_ANONYMOUS"
  }
}
```

---

## ⏱️ request_timeout エラー - タイムリミット

### LINEの制約
```
┌─────────────────────────────────┐
│ Webhook タイムアウト: 10秒      │
│ この時間内にHTTPレスポンス必須  │
└─────────────────────────────────┘
```

### 現在の処理時間

| 処理内容 | 処理時間 | タイムアウトリスク |
|:--------|:--------|:------------------|
| 通常メッセージ（3セット） | 2-7秒 | 低 ✅ |
| 大量セット（10セット） | 3-14秒 | 高 ⚠️ |
| **JSON書き出し** | **5-14秒** | **非常に高 🔴** |

### 処理時間の内訳（JSON書き出し）

```
ユーザー認証:      0.5-1.5秒
全データ読み込み:   2-5秒    ⚠️ 1000行想定
JSON変換:         0.5-1.5秒
Drive保存:        1-3秒      ⚠️
LINE返信:         0.5-2秒
─────────────────────────────
合計:             5-14秒     🔴 タイムアウト！
```

---

## 🔍 原因特定フロー

### Step 1: エラータイプの確認

LINE Developer Console → Messaging API → Webhook統計

```
302エラーが多い → デプロイ設定の問題
                   ↓
                   「302エラー対策」へ

request_timeoutが多い → 処理時間の問題
                        ↓
                        「タイムアウト対策」へ
```

### Step 2: GAS実行ログの確認

Apps Script → 実行数 → doPost でフィルタ

```
実行ログが無い → 302エラー（Webhookが届いていない）
実行ログがある → request_timeout（処理時間超過）
```

### Step 3: 処理時間の確認

実行ログの「実行時間」列を確認

```
< 5秒  → 正常
5-10秒 → 境界線（最適化推奨）
> 10秒 → タイムアウト確実
```

---

## 📊 コード問題箇所マップ

### 🔴 Critical（即修正推奨）

#### 1. JSON書き出し（export.ts）
```typescript
// 問題: doPost内で同期実行、10秒超過確実
if (messageText === 'json書き出し') {
  const records = loadTrainingRecords();  // 2-5秒
  const jsonData = convertRecordsToJson(records);  // 0.5-1.5秒
  const fileUrl = saveJsonToDrive(jsonData);  // 1-3秒
  replyToUser(replyToken, `...${fileUrl}`);  // 0.5-2秒
}
// → 非同期処理または時間ベーストリガーへ移行必須
```

### 🟠 High（最適化推奨）

#### 2. appendRow の複数実行（index.ts）
```typescript
// 問題: 1セットごとにAPI呼び出し（遅い）
records.forEach(record => {
  sheet.appendRow([...]);  // 200-1000ms × セット数
});

// → setValues() でバッチ書き込みに変更
```

#### 3. ユーザー認証の毎回読み込み（user.ts）
```typescript
// 問題: Webhookのたびにスプレッドシート読み込み
export function loadAllowedUserIds(): string[] {
  const values = sheet.getDataRange().getValues();  // 500-1500ms
  // ...
}

// → CacheService でキャッシュ
```

### 🟡 Medium（改善推奨）

#### 4. 早期レスポンス返却の欠如（index.ts）
```typescript
// 問題: 全処理完了後にレスポンス返却
events.forEach((event: any) => {
  // 処理...
  replyToUser(replyToken, message);
});
return ContentService.createTextOutput(...);  // ← ここで初めてレスポンス

// → バリデーション後、即座に200 OKを返す
```

---

## 🛠️ 対策の優先順位

### Priority 1: 302エラー対策（1時間）

```
1. appsscript.json の executeAs を変更
2. npm run build && npm run deploy
3. 新しいデプロイ作成
4. LINE Developer Console でURL更新
5. 検証テスト
```

### Priority 2: JSON書き出しのタイムアウト対策（2-3時間）

```
オプションA: コマンド受付のみ、処理は時間ベーストリガー
オプションB: コマンド受付のみ、処理は別プロジェクトで非同期実行
オプションC: JSON書き出し機能を一時無効化
```

### Priority 3: 処理最適化（3-4時間）

```
1. appendRow → setValues() 変更
2. ユーザー認証のキャッシュ実装
3. 早期レスポンス返却の実装
```

---

## 📝 再現テスト手順

### Test 1: 302エラーの再現

```
1. 現在の設定で LINE にメッセージ送信
2. LINE Developer Console → Webhook統計 で確認
3. GAS → 実行数 で doPost 実行を確認
   → 実行されていない場合、302エラー
```

### Test 2: タイムアウトの再現

```
1. 大量セットメッセージを送信:
   「4/26 test店
   dベンチ 100:10,100:9,100:8,95:10,95:9,95:8,90:10,90:9,90:8,85:10」

2. GAS → 実行数 で処理時間を確認
   → 10秒超えている場合、タイムアウト

3. 「json書き出し」コマンド送信
   → ほぼ確実にタイムアウト（データ量による）
```

---

## 📚 参考リンク

### LINE公式
- [Webhook Event Objects](https://developers.line.biz/ja/reference/messaging-api/#webhook-event-objects)
- [Webhook のベストプラクティス](https://developers.line.biz/ja/docs/messaging-api/receiving-messages/#webhook-best-practices)
  - **重要**: "Webhookサーバーは、受信したHTTPリクエストに対し、できるだけ早く200を返す必要があります"

### Google Apps Script
- [Web Apps Guide](https://developers.google.com/apps-script/guides/web)
- [Deploying Web Apps](https://developers.google.com/apps-script/guides/web#deploying_a_script_as_a_web_app)
- [executeAs と access の組み合わせ](https://developers.google.com/apps-script/guides/web#permissions)

---

## 🎯 調査結論

### 302エラー
**原因**: `executeAs: USER_DEPLOYING` による認証リダイレクト  
**対策**: `executeAs: USER_ACCESSING` に変更  
**作業時間**: 1時間以内  
**難易度**: ★☆☆☆☆

### request_timeout エラー
**原因**: JSON書き出し処理の実行時間超過（10秒以上）  
**対策**: 非同期処理への移行  
**作業時間**: 2-4時間  
**難易度**: ★★★☆☆

---

**調査完了**: 2025年11月15日  
**詳細レポート**: `WEBHOOK_ERROR_INVESTIGATION.md`, `TECHNICAL_ANALYSIS.md`
