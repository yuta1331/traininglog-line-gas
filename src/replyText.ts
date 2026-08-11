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

    // TODO: 記録ストアの障害をフォーマットエラーとして返すのは現状のバグ。
    // 構造変更の差分を挙動変更と混ぜないため、ここでは現状の文言を保存している
    case 'invalid_format':
    case 'store_error':
      return result.detail
        ? `フォーマット間違ってるよ！📝-> ${result.detail}`
        : 'フォーマット間違ってるよ！📝';

    case 'busy':
      return '⏱️ 処理が混み合っています。しばらく待ってから再度お試しください。';

    case 'export_ok':
      return `✅ Jsonファイルを作成しました！\nこちらからダウンロードできます👇\n${result.url}`;

    case 'export_failed':
      return `❌ エクスポート失敗: ${result.detail ?? 'Unknown error'}`;

    // 許可されていないユーザーと、記録でない通常メッセージには返信しない
    case 'unauthorized':
    case 'ignored':
      return null;
  }
}
