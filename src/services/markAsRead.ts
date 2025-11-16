// メッセージを既読にするサービス

import { CONFIG } from '../config';

/**
 * LINEメッセージを既読にします
 * @param markAsReadToken Webhookイベントから取得したmarkAsReadToken
 */
export function markMessageAsRead(markAsReadToken: string | undefined): void {
  // markAsReadTokenが存在しない場合は処理をスキップ
  if (!markAsReadToken) {
    Logger.log('markAsReadToken is not available. Skipping mark as read.');
    return;
  }

  const url = 'https://api.line.me/v2/bot/chat/markAsRead';

  const payload = {
    markAsReadToken,
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

  try {
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();

    const responseBody = response.getContentText();
    Logger.log(`markMessageAsRead response: Status: ${statusCode}, Body: ${responseBody}`);
  } catch (error) {
    Logger.log(`markMessageAsRead error: ${error instanceof Error ? error.message : String(error)}`);
  }
}
