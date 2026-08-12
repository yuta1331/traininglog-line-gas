// TypeScript: Google Apps ScriptでLINE Webhookを処理するメインエントリーポイント
//
// このファイルはHTTPの出入りだけを担うadapter。
// メッセージ1通をどう処理するかはservices/messageHandler.tsが持つ。

import { CONFIG } from './config';
import { loadAllowedUserIds } from './services/user';
import { handleTextMessage } from './services/messageHandler';
import { appendTrainingRecords } from './services/trainingLogStore';
import { exportRecordsToJsonFile } from './services/export';
import { replyToUser } from './services/reply';
import { markMessageAsRead } from './services/markAsRead';
import { toReplyText } from './replyText';
import { isValidWebhookToken } from './services/webhookToken';
import { rotateWebhookToken, setupRotationTrigger } from './services/tokenRotation';

/**
 * doPostはLINE WebhookのHTTP POSTエンドポイントです
 * @param e POSTリクエストを含むイベントオブジェクト
 * @returns 成功または失敗を示すTextOutput
 */
function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  try {
    // 送信元トークン（ADR-0004）の照合はここ、JSON.parseより前に置く。
    // トークンを持たない偽造リクエストにJSONパースもシート読み込み（loadAllowedUserIds）も
    // 起こさせないため。この副次効果はADR-0004が明記しており、位置を動かすと静かに壊れる。
    //
    // CONFIG.WEBHOOK_TOKEN未設定（fail-closed）はgetScriptPropertyがthrowするため、
    // この行は必ずtryの内側に置く。外に置くとthrowがハンドラを抜けてGASのHTMLエラー
    // ページが返り、「不一致時も正常時と同じ応答を返す」を別経路で破ってしまう。
    //
    // e.parameterは型定義上は必須だが、防御的にオプショナルとして読む。
    const receivedToken = e.parameter ? e.parameter['t'] : undefined;
    if (!isValidWebhookToken(receivedToken, CONFIG.WEBHOOK_TOKEN)) {
      // 不一致でも正常時とまったく同じ応答を返す。区別可能な応答は、URLを掴んだ
      // 相手に「URLは当たり、トークンだけ違う」と教えることになる（ADR-0004）。
      // ログには受信値のみを残し、期待値側のトークン（CONFIG.WEBHOOK_TOKEN）は書かない。
      Logger.log(`Webhook token mismatch. received: ${receivedToken}`);
      return jsonOutput({ status: 'ok' });
    }

    // POSTボディをJSONにパース
    const json = JSON.parse(e.postData.contents);

    const events: any[] = json.events;
    if (!events || events.length === 0) {
      // 応答は常に{status:'ok'}に統一する。events有無で応答を変えると、上のトークン不一致時の
      // {status:'ok'}と組み合わさったとき、URLを掴んだ相手に「トークンは一致している」ことを
      // 教えるオラクルになる（{"events":[]}を投げるだけで、推測したトークンの当否が
      // 外から分かってしまう: ADR-0004）。「イベントが無かった」という情報自体はログにのみ残す。
      // 将来「デバッグしにくいから」という理由でここの分岐を戻さないこと。
      Logger.log('No events in request.');
      return jsonOutput({ status: 'ok' });
    }

    // 許可ユーザーの読み込みはリクエストごとに1回。
    // イベント単位で読むと複数件バッチのときにシートを何度も読むことになる
    const allowedUserIds = loadAllowedUserIds();

    events.forEach((event: any) => {
      // 1件の失敗が残りのイベントを巻き込まないよう、イベント単位で隔離する
      try {
        handleEvent(event, allowedUserIds);
      } catch (error) {
        Logger.log(`Error while handling event: ${errorMessageOf(error)}`);
      }
    });

    // 成功レスポンスを返す
    return jsonOutput({ status: 'ok' });

  } catch (error) {
    Logger.log(`Error: ${errorMessageOf(error)}`);
    // catchは常に正常時と同じ{status: 'ok'}を返す。
    // ここに来る代表例はCONFIG.WEBHOOK_TOKEN未設定時のgetScriptPropertyのthrowで、
    // 従来の{status: 'error', message: error.message}はその文言（プロパティ名を含む）
    // をそのまま外部に漏らしていた。詳細はLogger.logにのみ残す。
    return jsonOutput({ status: 'ok' });
  }
}

/**
 * Webhookイベント1件を処理し、必要なら返信します
 * @param event Webhookイベント
 * @param allowedUserIds 許可ユーザーIDの一覧
 */
function handleEvent(event: any, allowedUserIds: string[]): void {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return;
  }

  const result = handleTextMessage(
    {
      userId: event.source.userId,
      text: event.message.text,
      markAsReadToken: event.message.markAsReadToken,
    },
    {
      allowedUserIds,
      appendTrainingRecords,
      markAsRead: markMessageAsRead,
      exportJson: exportRecordsToJsonFile,
    }
  );

  const replyText = toReplyText(result);
  if (replyText !== null) {
    replyToUser(event.replyToken, replyText);
  }
}

function jsonOutput(body: Record<string, string>): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

// Google Apps ScriptのグローバルスコープへのAPI公開
//
// このファイルは`globalThis`形と`global`形をあえて使い分けている。理由は
// gas-entry-generatorの検出ロジック（node_modules/gas-entry-generator/index.js:176-185の
// isGlobalAssignmentExpression）が識別子名"global"をハードコードしていて、globalThisへの
// 代入からはビルド後のdist/index.jsにトップレベルのスタブ（例: `function foo() {}`）が
// 生成されないという、実測で確認済みの非対称性にある（vitestはNode上で動くため
// この非対称性を検出できない。ビルド後のdist/index.jsを目視して確認すること）。
//
// globalThis形（doPost）: スタブは生成されず、この実行時の代入だけでdoPostを公開する。
// doPostはウェブアプリのPOST経路からのみ実行時解決で呼ばれ、Apps Scriptエディタの
// 関数ドロップダウンに出る必要が無いため、これで足りる。この行は変更しないこと。
(globalThis as any).doPost = doPost;

// global形（rotateWebhookToken / setupRotationTrigger）: `global.x = ...`の形は
// gas-entry-generatorに検出され、dist/index.jsの先頭にトップレベルのスタブが生成される
// （IIFE内で__webpack_require__.g.xが実体を上書きするため、動作そのものは変わらない）。
// このスタブがApps Scriptエディタの関数ドロップダウンに出るための土台になる。
// setupRotationTrigger()はREADMEの導入手順でユーザーが手動実行するために、
// rotateWebhookTokenは月次トリガーが関数名の文字列で解決するために、どちらも
// ドロップダウンに出る必要がある（globalThis形では出ない）。公開はここに集約し、
// tokenRotation.tsの中ではglobal/globalThisへの代入を行わない。
(global as any).rotateWebhookToken = rotateWebhookToken;
(global as any).setupRotationTrigger = setupRotationTrigger;
