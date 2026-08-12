// メッセージを既読にするサービス

import { callLineApi } from './lineApi';

/**
 * LINEメッセージを既読にします
 *
 * LINE Official Account ManagerでChatがONの場合のみ、Webhookイベントの
 * message内にmarkAsReadTokenが含まれます。OFFの場合は何もせずスキップします。
 * @param markAsReadToken Webhookイベントのmessageから取得したmarkAsReadToken
 */
export function markMessageAsRead(markAsReadToken: string | undefined): void {
  // markAsReadTokenが存在しない場合は処理をスキップ
  if (!markAsReadToken) {
    Logger.log('markAsReadToken is not available. Skipping mark as read.');
    return;
  }

  callLineApi('post', '/v2/bot/chat/markAsRead', { markAsReadToken }, 'Mark message as read');
}
