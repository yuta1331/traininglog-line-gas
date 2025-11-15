// LINEユーザーへの返信を行うサービス

import { CONFIG } from '../config';

/**
 * LINEユーザーに返信します
 * @param replyToken 受信イベントからのトークン
 * @param message 送信するメッセージテキスト
 */
export function replyToUser(replyToken: string, message: string): void {
  const url = 'https://api.line.me/v2/bot/message/reply';

  const payload = {
    replyToken,
    messages: [
      {
        type: 'text',
        text: message,
      },
    ],
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${CONFIG.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  Logger.log(`Reply response: ${response.getContentText()}`);
}
