# LINE Webhook エラー調査 - クイックリファレンス

## 🚨 エラー概要

| エラータイプ | HTTP コード | 意味 | 影響 |
|:------------|:-----------|:-----|:-----|
| **302** | 302 Found | リダイレクト | Webhookが実行されない |
| **request_timeout** | - | タイムアウト | **2秒以内に2xxレスポンスを返せない** |

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
┌──────────────────────────────────────┐
│ Webhook タイムアウト: **2秒**        │
│ 2秒以内に2xxレスポンスを返す必要あり │
└──────────────────────────────────────┘
```

**重要**: 処理全体が10秒かかっても、最初の2秒以内にレスポンスを返せばタイムアウトしません！

### 現在の処理時間（レスポンス返却まで）

| 処理内容 | レスポンス時間 | タイムアウトリスク |
|:--------|:-------------|:------------------|
| 通常メッセージ（3セット） | 2-7秒 | **高 ⚠️** |
| 大量セット（10セット） | 3-14秒 | **非常に高 🔴** |
| **JSON書き出し** | **5-14秒** | **非常に高 🔴** |

**問題**: 全処理完了後にレスポンスを返すため、ほぼ確実に2秒を超過

### 処理時間の内訳（通常メッセージ）

```
ユーザー認証:      0.5-1.5秒
メッセージ処理:    0.1秒
書き込み:         0.5-2秒
LINE返信:         0.5-2秒
─────────────────────────────
合計（レスポンス返却）: 2-6秒  🔴 2秒超過！
```

---

## 🔍 原因特定フロー

### Step 1: エラータイプの確認

LINE Developer Console → Messaging API → Webhook統計

```
302エラーが多い → GAS Web App POST処理の問題
                   ↓
                   「302エラー対策」へ

request_timeoutが多い → 早期レスポンス返却の欠如
                        ↓
                        「タイムアウト対策」へ
```

### Step 2: GAS実行ログの確認

Apps Script → 実行数 → doPost でフィルタ

```
実行ログが無い → 302エラー（Webhookが届いていない）
実行ログがある → request_timeout（2秒以内にレスポンス返却できない）
```

### Step 3: レスポンス返却時間の確認

実行ログの「実行時間」列を確認

```
< 2秒  → 正常（早期レスポンス返却実装済み）
2-10秒 → タイムアウト（早期レスポンス返却が未実装）
> 10秒 → タイムアウト + 処理時間も長い
```

**重要**: 実行時間が10秒でも、2秒以内にレスポンスを返していればタイムアウトしません。

---

## 📊 コード問題箇所マップ

### 🔴 Critical（即修正推奨）

#### 1. 早期レスポンス返却の欠如（index.ts）
```typescript
// 問題: 全処理完了後にレスポンス返却（2-6秒後）
events.forEach((event: any) => {
  // 処理...
  replyToUser(replyToken, message);
});
return ContentService.createTextOutput({ status: 'ok' });  // ← ここで初めて返却

// → バリデーション後、即座に200 OKを返す実装が必須
```

### 🟠 High（補助的最適化）

#### 2. appendRow の複数実行（index.ts）
```typescript
// 問題: 1セットごとにAPI呼び出し（遅い）
records.forEach(record => {
  sheet.appendRow([...]);  // 200-1000ms × セット数
});

// → setValues() でバッチ書き込みに変更（補助的最適化）
```

#### 3. ユーザー認証の毎回読み込み（user.ts）
```typescript
// 問題: Webhookのたびにスプレッドシート読み込み
export function loadAllowedUserIds(): string[] {
  const values = sheet.getDataRange().getValues();  // 500-1500ms
  // ...
}

// → CacheService でキャッシュ（補助的最適化）
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

### Priority 2: 早期レスポンス返却の実装（2-3時間）★最重要

```
1. バリデーション処理の実装
2. 即座に200 OKレスポンス返却
3. 処理は継続して実行（GAS内で非同期的に継続）
4. テスト・検証
```

**効果**: これだけで大半のrequest_timeoutを解決可能

### Priority 3: 処理最適化（補助的、2-3時間）

```
1. appendRow → setValues() 変更
2. ユーザー認証のキャッシュ実装
3. その他の最適化
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
1. 任意のトレーニング記録を送信:
   「4/26 test店
   dベンチ 100:10,100:9,100:8」

2. GAS → 実行数 で処理時間を確認
   → レスポンス返却までの時間が2秒を超えている場合、タイムアウト
   → （処理全体の時間ではなく、レスポンス返却までの時間が重要）

3. LINE Developer Console → Webhook統計 で確認
   → request_timeoutエラーが記録されているか確認
```

**重要**: 処理全体が10秒かかっても、2秒以内にレスポンスを返せばタイムアウトしません。

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
**原因**: GAS Web AppのPOST処理特有のリダイレクト（`executeAs: USER_DEPLOYING`設定による）  
**対策**: `executeAs: USER_ACCESSING` に変更  
**作業時間**: 1時間以内  
**難易度**: ★☆☆☆☆

### request_timeout エラー
**原因**: 早期レスポンス返却の欠如（全処理完了後にレスポンスを返すため、**2秒以内にレスポンスを返せない**）  
**対策**: バリデーション後、即座に200 OKを返す実装  
**作業時間**: 2-3時間  
**難易度**: ★★★☆☆

**重要**: 処理時間が10秒かかっても、2秒以内にレスポンスを返せばタイムアウトしません。早期レスポンス返却の実装が最優先です。

---

**調査完了**: 2025年11月15日  
**詳細レポート**: `WEBHOOK_ERROR_INVESTIGATION.md`, `TECHNICAL_ANALYSIS.md`
