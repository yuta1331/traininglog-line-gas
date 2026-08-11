import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleTextMessage,
  MessageHandlerDeps,
  MessageInput,
} from '../src/services/messageHandler';
import { StoreBusyError, StoreError } from '../src/services/trainingLogStore';
import { takeLogs } from './setup';

const ALLOWED = 'U-allowed';
const DENIED = 'U-denied';

function makeDeps(overrides: Partial<MessageHandlerDeps> = {}): MessageHandlerDeps {
  return {
    allowedUserIds: [ALLOWED],
    appendTrainingRecords: vi.fn(),
    markAsRead: vi.fn(),
    exportJson: vi.fn(() => 'https://drive.example/training_data.json'),
    ...overrides,
  };
}

function message(text: string, overrides: Partial<MessageInput> = {}): MessageInput {
  return { userId: ALLOWED, text, markAsReadToken: 'token-1', ...overrides };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-11T09:00:00+09:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('許可ユーザーの判定と既読の順序', () => {
  it('許可されていないユーザーには何もしない', () => {
    const deps = makeDeps();

    const result = handleTextMessage(message('4/26 A店\nスクワット 100:5', { userId: DENIED }), deps);

    expect(result).toEqual({ type: 'unauthorized' });
    expect(deps.markAsRead).not.toHaveBeenCalled();
    expect(deps.appendTrainingRecords).not.toHaveBeenCalled();
  });

  it('許可ユーザーのメッセージには既読を付ける', () => {
    const deps = makeDeps();

    handleTextMessage(message('4/26 A店\nスクワット 100:5'), deps);

    expect(deps.markAsRead).toHaveBeenCalledWith('token-1');
  });

  it('記録でない通常メッセージにも既読は付ける', () => {
    const deps = makeDeps();

    const result = handleTextMessage(message('おはよう'), deps);

    expect(result).toEqual({ type: 'ignored' });
    expect(deps.markAsRead).toHaveBeenCalledWith('token-1');
    expect(deps.appendTrainingRecords).not.toHaveBeenCalled();
  });

  it('markAsReadTokenが無くてもそのまま渡す（既読処理側でスキップされる）', () => {
    const deps = makeDeps();

    handleTextMessage(message('おはよう', { markAsReadToken: undefined }), deps);

    expect(deps.markAsRead).toHaveBeenCalledWith(undefined);
  });
});

describe('トレーニング記録の保存', () => {
  it('パースした記録を記録ストアに渡す', () => {
    const deps = makeDeps();

    const result = handleTextMessage(message('4/26 A店\nスクワット 100:5,100:3'), deps);

    expect(result).toEqual({ type: 'saved' });
    expect(deps.appendTrainingRecords).toHaveBeenCalledTimes(1);
    const records = vi.mocked(deps.appendTrainingRecords).mock.calls[0][0];
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ userId: ALLOWED, shop: 'A店', event: 'スクワット', topSet: true });
  });

  it('種目行が無いと記録ストアを呼ばずno_recordsを返す（#31）', () => {
    const deps = makeDeps();

    const result = handleTextMessage(message('4/26 A店'), deps);

    expect(result).toEqual({ type: 'no_records' });
    expect(deps.appendTrainingRecords).not.toHaveBeenCalled();
  });

  it('フォーマットが壊れていればinvalid_formatを返す', () => {
    const deps = makeDeps();

    const result = handleTextMessage(message('4/26 A店\nスクワット'), deps);

    expect(result).toEqual({
      type: 'invalid_format',
      reason: { kind: 'workout_line', line: 2 },
    });
    expect(deps.appendTrainingRecords).not.toHaveBeenCalled();
  });

  it('パース以外の例外はフォーマットエラーとして返さない', () => {
    // isTrainingRecordを通り、かつparseTrainingLogがParseError以外を投げる入力は
    // 現状作れないため、ここでは保存段の例外で代表させる
    const deps = makeDeps({
      appendTrainingRecords: vi.fn(() => {
        throw new TypeError('Cannot read properties of undefined');
      }),
    });

    const result = handleTextMessage(message('4/26 A店\nスクワット 100:5'), deps);

    expect(result).toEqual({ type: 'unknown_error' });
    expect(deps.appendTrainingRecords).toHaveBeenCalledTimes(1);
  });

  it('記録ストアの障害はinvalid_formatと区別する', () => {
    const deps = makeDeps({
      appendTrainingRecords: vi.fn(() => {
        throw new StoreError('Sheet TrainingLog not found.');
      }),
    });

    const result = handleTextMessage(message('4/26 A店\nスクワット 100:5'), deps);

    expect(result).toEqual({ type: 'store_error' });
  });

  it('ロックを取れなければbusyを返す', () => {
    const deps = makeDeps({
      appendTrainingRecords: vi.fn(() => {
        throw new StoreBusyError('Failed to acquire script lock.');
      }),
    });

    const result = handleTextMessage(message('4/26 A店\nスクワット 100:5'), deps);

    expect(result).toEqual({ type: 'busy' });
  });

  it('保存中の想定外の例外はフォーマットエラーではなくunknown_errorにする', () => {
    const deps = makeDeps({
      appendTrainingRecords: vi.fn(() => {
        throw new Error('Service Spreadsheets failed while accessing document');
      }),
    });

    const result = handleTextMessage(message('4/26 A店\nスクワット 100:5'), deps);

    expect(result).toEqual({ type: 'unknown_error' });
  });

  it('障害の詳細はユーザーに返さずログに残す', () => {
    const deps = makeDeps({
      appendTrainingRecords: vi.fn(() => {
        throw new StoreError('Sheet TrainingLog not found.');
      }),
    });

    handleTextMessage(message('4/26 A店\nスクワット 100:5'), deps);

    expect(takeLogs().join('\n')).toContain('Sheet TrainingLog not found.');
  });
});

describe('JSON書き出し', () => {
  it('コマンドを受けたらURLを返す', () => {
    const deps = makeDeps();

    const result = handleTextMessage(message('json書き出し'), deps);

    expect(result).toEqual({ type: 'export_ok', url: 'https://drive.example/training_data.json' });
    expect(deps.exportJson).toHaveBeenCalledTimes(1);
  });

  it('書き出しに失敗したらexport_failedを返す', () => {
    const deps = makeDeps({
      exportJson: vi.fn(() => {
        throw new Error('No item with the given ID could be found');
      }),
    });

    const result = handleTextMessage(message('json書き出し'), deps);

    expect(result).toEqual({ type: 'export_failed' });
    expect(takeLogs().join('\n')).toContain('No item with the given ID could be found');
  });

  it('Error以外が投げられても落ちない', () => {
    const deps = makeDeps({
      exportJson: vi.fn(() => {
        throw 'boom';
      }),
    });

    const result = handleTextMessage(message('json書き出し'), deps);

    expect(result).toEqual({ type: 'export_failed' });
    expect(takeLogs().join('\n')).toContain('boom');
  });

  it('許可されていないユーザーは書き出しできない', () => {
    const deps = makeDeps();

    const result = handleTextMessage(message('json書き出し', { userId: DENIED }), deps);

    expect(result).toEqual({ type: 'unauthorized' });
    expect(deps.exportJson).not.toHaveBeenCalled();
  });
});
