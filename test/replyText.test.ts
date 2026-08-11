import { describe, expect, it } from 'vitest';
import { toReplyText } from '../src/replyText';
import { MessageResult } from '../src/services/messageHandler';

// 処理結果と文言の対応表。文言を変えるときはここが唯一の変更点になる。
const cases: [string, MessageResult, string | null][] = [
  ['保存成功', { type: 'saved' }, '登録したよ！💪'],
  [
    'フォーマットエラー',
    { type: 'invalid_format', detail: 'Invalid workout line format' },
    'フォーマット間違ってるよ！📝-> Invalid workout line format',
  ],
  ['フォーマットエラー（詳細なし）', { type: 'invalid_format' }, 'フォーマット間違ってるよ！📝'],
  [
    '記録ストアの障害（現状はフォーマットエラーと同じ文言。コミット3で分離する）',
    { type: 'store_error', detail: 'Sheet TrainingLog not found.' },
    'フォーマット間違ってるよ！📝-> Sheet TrainingLog not found.',
  ],
  ['混雑', { type: 'busy' }, '⏱️ 処理が混み合っています。しばらく待ってから再度お試しください。'],
  [
    'JSON書き出し成功',
    { type: 'export_ok', url: 'https://drive.example/a.json' },
    '✅ Jsonファイルを作成しました！\nこちらからダウンロードできます👇\nhttps://drive.example/a.json',
  ],
  [
    'JSON書き出し失敗',
    { type: 'export_failed', detail: 'No item with the given ID could be found' },
    '❌ エクスポート失敗: No item with the given ID could be found',
  ],
  ['JSON書き出し失敗（詳細なし）', { type: 'export_failed' }, '❌ エクスポート失敗: Unknown error'],
  ['許可されていないユーザー', { type: 'unauthorized' }, null],
  ['記録でない通常メッセージ', { type: 'ignored' }, null],
];

describe('toReplyText', () => {
  it.each(cases)('%s', (_name, result, expected) => {
    expect(toReplyText(result)).toBe(expected);
  });
});
