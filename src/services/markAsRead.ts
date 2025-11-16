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

    if (statusCode === 200) {
      Logger.log('Message marked as read successfully.');
    } else {
      const errorBody = response.getContentText();
      Logger.log(`Failed to mark message as read. Status: ${statusCode}, Response: ${errorBody}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      Logger.log(`Error marking message as read: ${error.message}`);
    } else {
      Logger.log('Unknown error occurred while marking message as read.');
    }
  }
}
