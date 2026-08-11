// 処理結果をLINEに返す文言へ変換する
//
// doPost側（adapter）の関心。messageHandlerは文言を知らない。
// 処理結果と文言はN:1で対応してよい（ログで区別できれば十分な違いは文言に出さない）。

import { InvalidFormatReason, MessageResult } from './services/messageHandler';

/**
 * 処理結果をLINEへの返信文言に変換します
 * @param result messageHandlerの処理結果
 * @returns 返信する文言。返信しない場合はnull
 */
export function toReplyText(result: MessageResult): string | null {
  switch (result.type) {
    case 'saved':
      return '登録したよ！💪';

    case 'no_records':
      return '登録する記録が無かったよ📝';

    case 'invalid_format':
      return `フォーマット間違ってるよ！📝\n${invalidFormatHint(result.reason)}`;

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

/** どこをどう直せばよいかを行番号つきで伝える */
function invalidFormatHint(reason: InvalidFormatReason): string {
  switch (reason.kind) {
    case 'first_line':
      return `${reason.line}行目は「4/26 A店」みたいに日付と店舗名を書いてね`;
    case 'blank_line':
      return `${reason.line}行目が空行になってるよ`;
    case 'workout_line':
      return `${reason.line}行目は「種目名 24:12,24:10」みたいに書いてね`;
    case 'set_format':
      return `${reason.line}行目の重さと回数は「24:12」みたいに数字で書いてね`;
  }
}
