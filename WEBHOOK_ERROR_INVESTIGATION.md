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

#### 1.1 **Google Apps Script Web AppのPOST処理特有の挙動**（最有力）

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
Google Apps Script の Web App では、特定の条件下でPOSTリクエストに対して302リダイレクトを返す挙動があります。

**302エラーが発生するシナリオ:**
1. LINE WebhookがGAS WebアプリにPOSTリクエストを送信
2. GAS側で何らかの理由（認証状態、セッション、デプロイ設定など）により302レスポンスを返す
3. これは必ずしもOAuth認証画面へのリダイレクトではなく、**Apps Script Web App自体のPOST処理特有のリダイレクト挙動**
4. LINE側は302レスポンスを受け取り、エラーとして記録

**可能性のある原因:**
- デプロイURLの不一致（テストデプロイと本番デプロイの混在）
- `executeAs: "USER_DEPLOYING"` と `access: "ANYONE_ANONYMOUS"` の組み合わせによる内部リダイレクト
- セッション管理やCookie関連の処理による一時的なリダイレクト

**推奨設定:**
```json
{
  "webapp": {
    "executeAs": "USER_ACCESSING",
    "access": "ANYONE_ANONYMOUS"
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

#### 2.1 **早期レスポンス返却の欠如**（最有力）

**LINE Messaging API の制約:**
- **Webhookレスポンスタイムアウト**: **2秒以内に2xxステータスコードを返す必要がある**
- GASがこの時間内にHTTPレスポンスを返さない場合、request_timeoutエラーが記録される
- **注意**: 処理全体が10秒かかっても、最初の2秒以内に200 OKを返せばタイムアウトにはならない

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
- データ量が多い場合、処理に時間がかかる（ただし、2秒以内にレスポンスを返せば問題ない）

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
4. スプレッドシート書き込み（複数行）: 0.5-2秒
5. LINE返信API呼び出し: 0.5-1秒
6. doPost終了、HTTPレスポンス返却
   → 合計: 2.1-6.1秒
   → 2秒を超えた時点で、request_timeoutエラー
```

**重要**: 処理全体が10秒かかっても、最初の2秒以内に200 OKを返却していればタイムアウトにはなりません。現在の実装では、全処理完了後にレスポンスを返すため、2秒を超える可能性が高いです。

#### 2.2 **全処理完了後のレスポンス返却**

**現在の実装:**
```typescript
// index.ts - doPost()
events.forEach((event: any) => {
  // 処理実行
  // ...
  replyToUser(replyToken, message);  // 同期的に返信
});

// 最後にレスポンス返却（全処理完了後）
return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
  .setMimeType(ContentService.MimeType.JSON);
```

**問題点:**
- **LINEへの返信処理が完了するまでHTTPレスポンスを返さない**
- 複数イベントの場合、順次処理するため時間が累積
- ユーザー認証（1-3秒）+ 書き込み（0.5-2秒）+ LINE返信（0.5-1秒）= **2-6秒**
- **2秒を超える可能性が高く、request_timeoutエラーの主要原因**

#### 2.3 **スプレッドシートアクセスの競合**

**潜在的な問題:**
- 複数のWebhookが同時に到着した場合、スプレッドシートへの同時書き込み
- GASの実行インスタンス間での競合によるレイテンシ増加
- スプレッドシートのサイズが大きい場合、`getDataRange()` が遅延

---

### 3. コード実装上の技術的課題

#### 3.1 **早期レスポンス返却の欠如**（最重要）

**問題:**
- doPost関数は全処理完了後にレスポンスを返す設計
- **LINE Webhookは2秒以内に2xxレスポンスが必要**
- LINE Webhookのベストプラクティスは「即座に200 OKを返し、処理は継続または非同期で実行」

**現在の実装フロー:**
```
POST受信 → 認証 → パース → DB書き込み → LINE返信 → レスポンス返却（2-6秒後）
                                                    ↑ タイムアウト！
```

**推奨フロー:**
```
POST受信 → バリデーション → 200 OK返却（即座） | 処理継続（認証/書き込み/返信）
                              ↑ 2秒以内
```

**対策の効果:**
- 早期レスポンス返却を実装すれば、処理が10秒かかってもタイムアウトしない
- これが**request_timeout対策の最優先事項**

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
| デプロイ設定が `executeAs: USER_DEPLOYING` | ⭐⭐⭐ | GAS Web AppのPOST処理で内部リダイレクトが発生する可能性 |
| テストデプロイURLを使用 | ⭐⭐⭐ | テストデプロイは再デプロイ時にURLが変更される |
| デプロイバージョンが「HEAD」 | ⭐⭐ | 自動更新されるため、リダイレクトの可能性 |
| URL不一致やセッション問題 | ⭐⭐ | GAS Web App特有のPOSTリダイレクト挙動 |

### request_timeout エラー発生条件

| 条件 | 可能性 | 想定レスポンス時間 |
|:-----|:------:|:------------|
| **早期レスポンス返却の欠如**（最重要） | ⭐⭐⭐ | **2-6秒（2秒超過）** |
| 通常のトレーニング記録 | ⭐⭐⭐ | 2-6秒 |
| JSON書き出し | ⭐⭐⭐ | 3-10秒 |
| スプレッドシート読み込みが遅い | ⭐⭐ | +1-3秒 |
| 複数イベント同時処理 | ⭐⭐ | イベント数 × 処理時間 |
| GASコールドスタート | ⭐ | +0.5-2秒（初回実行時） |

**注意**: 処理時間が10秒かかっても、2秒以内にレスポンスを返せばタイムアウトしません。現在の実装では全処理完了後にレスポンスを返すため、2秒を超える可能性が高いです。

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

1. **通常のトレーニング記録送信:**
   - 任意のトレーニング記録を送信
   ```
   4/26 test店
   dベンチ 100:10,100:9,100:8
   ```

2. **処理時間の確認:**
   - GAS実行ログでdoPost実行時間を確認
   - **2秒以内にレスポンスを返しているか確認**（処理全体の時間ではない）

3. **ログ確認:**
   - GAS実行ログで処理時間を確認
   - レスポンス返却までの時間が2秒を超えている場合、タイムアウトの可能性
   - **重要**: 処理全体が10秒かかっても、2秒以内にレスポンスを返せばタイムアウトしない

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

1. **⭐⭐⭐ GAS Web AppのPOST処理特有のリダイレクト**
   - `executeAs: USER_DEPLOYING` + `access: ANYONE_ANONYMOUS`
   - Apps Script Web App内部でのリダイレクト発生

2. **⭐⭐⭐ テストデプロイURLの使用**
   - URLが変更され、古いURLにアクセスするとリダイレクト

3. **⭐⭐ デプロイバージョンの管理不足**
   - 「HEAD」バージョンの使用による不安定性

### request_timeout エラーの主要原因（優先度順）

1. **⭐⭐⭐ 早期レスポンス返却の欠如**（最重要）
   - 全処理完了後にレスポンス返却するため、2秒以内にレスポンスを返せない
   - **これが最も重要な原因**

2. **⭐⭐ 処理時間の累積**
   - ユーザー認証（1-3秒）+ 書き込み（0.5-2秒）+ LINE返信（0.5-1秒）= 2-6秒
   - 2秒を超える可能性が高い

3. **⭐⭐ スプレッドシート読み込みの遅延**
   - getDataRange() の実行時間増加（データ量による）

4. **⭐ GASコールドスタート**
   - 初回実行時の遅延（+0.5-2秒）

**注意**: 処理全体が10秒かかっても、2秒以内にレスポンスを返せばタイムアウトしません。

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

1. **✅ 早期レスポンス返却の実装**（最優先）
   - **バリデーション後、即座に200 OKを返す**
   - 処理は継続して実行（GAS内で非同期的に継続）
   - **これだけで大半のタイムアウトを解決可能**

2. ✅ スプレッドシート書き込みの最適化（補助的）
   - appendRow の複数呼び出しを setValues() にまとめる
   - バッチ処理の実装

3. ✅ ユーザー認証のキャッシュ化（補助的）
   - CacheService を使用して許可ユーザーリストをキャッシュ
   - 毎回スプレッドシート読み込みを回避

**重要**: 早期レスポンス返却を実装すれば、処理が10秒かかってもタイムアウトしません。他の最適化は処理速度向上のための補助的な対策です。

---

## 📝 補足: ログ証跡の収集方法

### GAS実行ログの確認

1. **Apps Script エディタ:**
   - 左メニュー → 実行数
   - フィルタ: doPost
   - **実行時間を確認（2秒超過の有無）**

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
**最も可能性が高い原因**: GAS Web AppのPOST処理特有のリダイレクト挙動（`executeAs: USER_DEPLOYING`設定による）

### request_timeout エラー
**最も可能性が高い原因**: 
1. **早期レスポンス返却の欠如**（最重要）- 全処理完了後にレスポンスを返すため、2秒以内にレスポンスを返せない
2. 処理時間の累積（2-6秒）- ユーザー認証 + 書き込み + LINE返信

**共通課題**: 
- **LINE Webhookは2秒以内に2xxレスポンスが必要**という制約への対応不足
- Webhook処理のベストプラクティス（早期レスポンス返却）が実装されていない
- 同期処理中心の設計

**重要な発見**:
- 処理全体が10秒かかっても、2秒以内にレスポンスを返せばタイムアウトしない
- したがって、処理時間の最適化よりも**早期レスポンス返却の実装が最優先**

---

**調査完了日**: 2025年11月15日  
**次のアクション**: 対策Issueでの実装検討
