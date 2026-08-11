// TypeScript: Google Apps ScriptでLINE Webhookを処理するメインエントリーポイント
//
// このファイルはHTTPの出入りだけを担うadapter。
// メッセージ1通をどう処理するかはservices/messageHandler.tsが持つ。

import { loadAllowedUserIds } from './services/user';
import { handleTextMessage } from './services/messageHandler';
import { appendTrainingRecords } from './services/trainingLogStore';
import { exportRecordsToJsonFile } from './services/export';
import { replyToUser } from './services/reply';
import { markMessageAsRead } from './services/markAsRead';
import { toReplyText } from './replyText';

/**
 * doPostはLINE WebhookのHTTP POSTエンドポイントです
 * @param e POSTリクエストを含むイベントオブジェクト
 * @returns 成功または失敗を示すTextOutput
 */
function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  try {
    // POSTボディをJSONにパース
    const json = JSON.parse(e.postData.contents);

    const events: any[] = json.events;
    if (!events || events.length === 0) {
      return jsonOutput({ status: 'no events' });
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
    if (error instanceof Error) {
      Logger.log(`Error: ${error.message}`);
      return jsonOutput({ status: 'error', message: error.message });
    }
    Logger.log('Unknown error occurred.');
    return jsonOutput({ status: 'error', message: 'Unknown error' });
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

// Google Apps ScriptのグローバルスコープにdoPostを公開
//
// ビルド後のdist/index.jsでは、この実行時の代入だけがdoPostを公開している。
// gas-webpack-plugin（gas-entry-generator）が検出するのは `global.x = ...` の形だけで
// （node_modules/gas-entry-generator/index.js:182）、globalThisへの代入からは
// トップレベルのスタブが生成されない。この行を消すとGASからdoPostが見えなくなる。
(globalThis as any).doPost = doPost;
