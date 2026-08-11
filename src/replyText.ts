// 処理結果をLINEに返す文言へ変換する
//
// doPost側（adapter）の関心。messageHandlerは文言を知らない。
// 処理結果と文言はN:1で対応してよい（ログで区別できれば十分な違いは文言に出さない）。

import { MessageResult } from './services/messageHandler';

/**
 * 処理結果をLINEへの返信文言に変換します
 * @param result messageHandlerの処理結果
 * @returns 返信する文言。返信しない場合はnull
 */
export function toReplyText(result: MessageResult): string | null {
  switch (result.type) {
    case 'saved':
      return '登録したよ！💪';

    case 'invalid_format':
      return result.detail
        ? `フォーマット間違ってるよ！📝-> ${result.detail}`
        : 'フォーマット間違ってるよ！📝';

    // 保存に失敗したことだけを伝える。原因の区別はユーザーには意味が無いので
    // 処理結果の粒度と文言の粒度を一致させない（詳細はログに出している）
    case 'store_error':
    case 'unknown_error':
      return '⚠️ 保存に失敗したよ…ちょっと待ってもう一度送ってみて！';

    case 'busy':
      return '⏱️ 処理が混み合っています。しばらく待ってから再度お試しください。';

    case 'export_ok':
      return `✅ Jsonファイルを作成しました！\nこちらからダウンロードできます👇\n${result.url}`;

    case 'export_failed':
      return '❌ エクスポート失敗…ちょっと待ってもう一度試してみて！';

    // 許可されていないユーザーと、記録でない通常メッセージには返信しない
    case 'unauthorized':
    case 'ignored':
      return null;
  }
}
