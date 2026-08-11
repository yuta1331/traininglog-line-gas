import { describe, expect, it, vi } from 'vitest';
import { TrainingRecord } from '../src/services/parse';
import {
  appendTrainingRecords,
  loadTrainingRecords,
  recordToRow,
  rowToRecord,
  StoreBusyError,
  StoreError,
  TrainingLogStoreDeps,
} from '../src/services/trainingLogStore';

const RECORD: TrainingRecord = {
  userId: 'U1',
  date: new Date('2026/4/26'),
  shop: 'A店',
  event: 'スクワット',
  weight: 100,
  reps: 5,
  topSet: true,
};

function fakeDeps(overrides: Partial<TrainingLogStoreDeps> = {}): TrainingLogStoreDeps {
  return {
    getSheet: () => null,
    withLock: (_timeoutMs, fn) => fn(),
    ...overrides,
  };
}

describe('recordToRow / rowToRecord — 列順を1箇所で所有する（#33）', () => {
  it('recordToRowは列順どおりに変換し、トップセットは1にする', () => {
    expect(recordToRow(RECORD)).toEqual(['U1', RECORD.date, 'A店', 'スクワット', 100, 5, 1]);
  });

  it('recordToRowはトップセットでなければ空文字にする', () => {
    expect(recordToRow({ ...RECORD, topSet: false })).toEqual(['U1', RECORD.date, 'A店', 'スクワット', 100, 5, '']);
  });

  it('rowToRecordはrecordToRowの出力を元のrecordに戻せる', () => {
    expect(rowToRecord(recordToRow(RECORD))).toEqual(RECORD);
  });

  it('rowToRecordはトップセット列が1以外ならfalseにする', () => {
    const row = recordToRow({ ...RECORD, topSet: false });
    expect(rowToRecord(row).topSet).toBe(false);
  });
});

describe('appendTrainingRecords', () => {
  it('0件なら記録ストアに触れない', () => {
    const getSheet = vi.fn();
    appendTrainingRecords([], fakeDeps({ getSheet }));
    expect(getSheet).not.toHaveBeenCalled();
  });

  it('シートが見つからなければStoreErrorを投げる', () => {
    expect(() => appendTrainingRecords([RECORD], fakeDeps({ getSheet: () => null }))).toThrow(StoreError);
  });

  it('lockの内側で末尾行の直後にrecordToRowした行をsetValuesする', () => {
    const setValues = vi.fn();
    const getRange = vi.fn(() => ({ setValues }));
    const sheet = {
      getLastRow: () => 5,
      getRange,
      getDataRange: () => ({ getValues: () => [] }),
    };

    appendTrainingRecords([RECORD], fakeDeps({ getSheet: () => sheet }));

    expect(getRange).toHaveBeenCalledWith(6, 1, 1, 7);
    expect(setValues).toHaveBeenCalledWith([recordToRow(RECORD)]);
  });

  it('lockが取得できなければStoreBusyErrorを投げる', () => {
    const sheet = { getLastRow: () => 0, getRange: vi.fn(), getDataRange: () => ({ getValues: () => [] }) };
    const withLock = vi.fn(() => {
      throw new StoreBusyError('Failed to acquire script lock.');
    });

    expect(() =>
      appendTrainingRecords([RECORD], fakeDeps({ getSheet: () => sheet, withLock }))
    ).toThrow(StoreBusyError);
  });
});

describe('loadTrainingRecords', () => {
  it('ヘッダーのみなら空配列を返す', () => {
    const sheet = {
      getLastRow: () => 1,
      getRange: vi.fn(),
      getDataRange: () => ({ getValues: () => [['header']] }),
    };

    expect(loadTrainingRecords(fakeDeps({ getSheet: () => sheet }))).toEqual([]);
  });

  it('データ行をrowToRecordでレコードに変換する', () => {
    const row = recordToRow(RECORD);
    const sheet = {
      getLastRow: () => 2,
      getRange: vi.fn(),
      getDataRange: () => ({ getValues: () => [['header'], row] }),
    };

    expect(loadTrainingRecords(fakeDeps({ getSheet: () => sheet }))).toEqual([RECORD]);
  });

  it('シートが見つからなければStoreErrorを投げる', () => {
    expect(() => loadTrainingRecords(fakeDeps({ getSheet: () => null }))).toThrow(StoreError);
  });
});
