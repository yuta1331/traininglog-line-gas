// LINEユーザーへの返信を行うサービス

import { callLineApi } from './lineApi';

/**
 * LINEユーザーに返信します
 * @param replyToken 受信イベントからのトークン
 * @param message 送信するメッセージテキスト
 */
export function replyToUser(replyToken: string, message: string): void {
  const payload = {
    replyToken,
    messages: [
      {
        type: 'text',
        text: message,
      },
    ],
  };

  callLineApi('post', '/v2/bot/message/reply', payload, 'Reply to user');
}
