import { describe, expect, it } from 'vitest';
import { toReplyText } from '../src/replyText';
import { MessageResult } from '../src/services/messageHandler';

// 処理結果と文言の対応表。文言を変えるときはここが唯一の変更点になる。
const cases: [string, MessageResult, string | null][] = [
  ['保存成功', { type: 'saved' }, '登録したよ！💪'],
  ['種目行が1つも無い', { type: 'no_records' }, '登録する記録が無かったよ📝'],
  [
    'フォーマットエラー: 種目行が読めない',
    { type: 'invalid_format', reason: { kind: 'workout_line', line: 3 } },
    'フォーマット間違ってるよ！📝\n3行目は「種目名 24:12,24:10」みたいに書いてね',
  ],
  [
    'フォーマットエラー: 重量・回数が読めない',
    { type: 'invalid_format', reason: { kind: 'set_format', line: 3 } },
    'フォーマット間違ってるよ！📝\n3行目の重さと回数は「24:12」みたいに数字で書いてね',
  ],
  [
    'フォーマットエラー: 1行目',
    { type: 'invalid_format', reason: { kind: 'first_line', line: 1 } },
    'フォーマット間違ってるよ！📝\n1行目は「4/26 A店」みたいに日付と店舗名を書いてね',
  ],
  [
    '記録ストアの障害',
    { type: 'store_error' },
    '⚠️ 保存に失敗したよ…ちょっと待ってもう一度送ってみて！',
  ],
  [
    '想定外のエラー（記録ストアの障害と同じ文言）',
    { type: 'unknown_error' },
    '⚠️ 保存に失敗したよ…ちょっと待ってもう一度送ってみて！',
  ],
  ['混雑', { type: 'busy' }, '⏱️ 処理が混み合っています。しばらく待ってから再度お試しください。'],
  [
    'JSON書き出し成功',
    { type: 'export_ok', url: 'https://drive.example/a.json' },
    '✅ Jsonファイルを作成しました！\nこちらからダウンロードできます👇\nhttps://drive.example/a.json',
  ],
  [
    'JSON書き出し失敗',
    { type: 'export_failed' },
    '❌ エクスポート失敗…ちょっと待ってもう一度試してみて！',
  ],
  ['許可されていないユーザー', { type: 'unauthorized' }, null],
  ['記録でない通常メッセージ', { type: 'ignored' }, null],
];

describe('toReplyText', () => {
  it.each(cases)('%s', (_name, result, expected) => {
    expect(toReplyText(result)).toBe(expected);
  });
});
