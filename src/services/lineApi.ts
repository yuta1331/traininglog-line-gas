// LINE Messaging APIへのPOSTを1箇所に集約するadapter
//
// reply.ts / markAsRead.ts はどちらも同じ認証ヘッダーとfetchオプションを組み立てていたが、
// ステータス判定と失敗ログはmarkAsReadだけが行っていた（reply側は失敗が握り潰されていた: #34）。
// この2つの利用者を薄い呼び出しにし、判定とログをここに1箇所だけ持つ。

import { CONFIG } from '../config';

const LINE_API_BASE_URL = 'https://api.line.me';

/**
 * LINE Messaging APIへPOSTします
 *
 * ステータスコードとネットワーク例外の両方をここで捕捉し、失敗をログに残します。
 * 呼び出し元には例外を伝播させません（doPost側のイベント処理フローを変えないため）。
 * @param path APIのパス（例: '/v2/bot/message/reply'）
 * @param payload リクエストボディ
 * @param context ログに含める呼び出し元の説明（例: 'Reply to user'）
 */
export function postToLine(path: string, payload: unknown, context: string): void {
  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${CONFIG.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(`${LINE_API_BASE_URL}${path}`, options);
    const statusCode = response.getResponseCode();

    if (statusCode >= 200 && statusCode < 300) {
      Logger.log(`${context} succeeded.`);
    } else {
      Logger.log(`${context} failed. Status: ${statusCode}, Response: ${response.getContentText()}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      Logger.log(`${context} error: ${error.message}`);
    } else {
      Logger.log(`${context} error: Unknown error occurred.`);
    }
  }
}
