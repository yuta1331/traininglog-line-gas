// Service for replying to LINE users

import { CONFIG } from '../config';

/**
 * Reply to a LINE user.
 * @param replyToken The token from the incoming event
 * @param message The message text to send back
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
