import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTrainingRecord, ParseError, parseTrainingLog } from '../src/services/parse';

// このファイルは特性テスト（characterization test）。
// 「こうあるべき」ではなく「現在こう動いている」を固定するもので、
// 挙動を変えるときは実装と一緒にここを更新する。

const USER = 'U1234567890';

/** パースに失敗することを前提に、投げられたParseErrorを取り出す */
function parseErrorOf(message: string): ParseError {
  try {
    parseTrainingLog(USER, message);
  } catch (error) {
    if (error instanceof ParseError) return error;
    throw error;
  }
  throw new Error('ParseErrorが投げられなかった');
}

beforeEach(() => {
  // parseTrainingLogは年の省略時に現在年を使う（parse.ts:48）ので時刻を固定する
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-11T09:00:00+09:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isTrainingRecord', () => {
  it('1行目が「日付 店舗」なら記録とみなす', () => {
    expect(isTrainingRecord('4/26 A店\nスクワット 100:5')).toBe(true);
  });

  it('年つきの日付も記録とみなす', () => {
    expect(isTrainingRecord('2025/4/26 A店')).toBe(true);
  });

  it('日付以外で始まるメッセージは記録とみなさない', () => {
    expect(isTrainingRecord('おはよう')).toBe(false);
    expect(isTrainingRecord('json書き出し')).toBe(false);
  });

  it('店舗名が無い日付だけの行は記録とみなさない', () => {
    expect(isTrainingRecord('4/26')).toBe(false);
  });

  it('2行目以降は判定に使わない', () => {
    expect(isTrainingRecord('4/26 A店\nこれは種目行として壊れている')).toBe(true);
  });
});

describe('parseTrainingLog', () => {
  it('種目行をセット単位のトレーニング記録に展開する', () => {
    const records = parseTrainingLog(USER, '4/26 A店\nスクワット 100:5,100:3');

    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      userId: USER,
      date: new Date('2026/4/26'),
      shop: 'A店',
      event: 'スクワット',
      weight: 100,
      reps: 5,
      topSet: true,
    });
    expect(records[1].topSet).toBe(false);
  });

  it('年が省略されたら現在年を補う', () => {
    const [record] = parseTrainingLog(USER, '4/26 A店\nスクワット 100:5');

    expect(record.date.getFullYear()).toBe(2026);
  });

  it('年が指定されていればそれを使う', () => {
    const [record] = parseTrainingLog(USER, '2024/4/26 A店\nスクワット 100:5');

    expect(record.date.getFullYear()).toBe(2024);
  });

  it('小数の重量を扱える', () => {
    const [record] = parseTrainingLog(USER, '4/26 A店\nダンベルカール 12.5:8');

    expect(record.weight).toBe(12.5);
  });

  describe('トップセットの判定', () => {
    it('最も重いセットを選ぶ', () => {
      const records = parseTrainingLog(USER, '4/26 A店\nスクワット 90:10,100:3,80:12');

      expect(records.map((r) => r.topSet)).toEqual([false, true, false]);
    });

    it('同じ重量なら回数が多いほうを選ぶ', () => {
      const records = parseTrainingLog(USER, '4/26 A店\nスクワット 100:5,100:8,100:3');

      expect(records.map((r) => r.topSet)).toEqual([false, true, false]);
    });

    it('重量も回数も同じなら先に書かれたほうを選ぶ', () => {
      const records = parseTrainingLog(USER, '4/26 A店\nスクワット 100:5,100:5');

      expect(records.map((r) => r.topSet)).toEqual([true, false]);
    });

    it('種目ごとに独立して判定する', () => {
      const records = parseTrainingLog(USER, '4/26 A店\nスクワット 100:5,120:3\nベンチ 60:10,50:12');

      expect(records.map((r) => r.topSet)).toEqual([false, true, true, false]);
    });
  });

  describe('現状の挙動として固定しておきたい端', () => {
    it('種目行が1つも無いと空配列を返す（呼び出し側はno_recordsとして扱う: #31）', () => {
      expect(parseTrainingLog(USER, '4/26 A店')).toEqual([]);
    });

    it('本文中の空行はエラーになる（#36）', () => {
      expect(() => parseTrainingLog(USER, '5/1 ジム\n\nスクワット 100:5')).toThrow(ParseError);
    });

    it('空行は読めない種目行とは別の種別として扱う', () => {
      expect(parseErrorOf('5/1 ジム\nスクワット 100:5\n\nベンチ 60:10')).toMatchObject({
        kind: 'blank_line',
        line: 3,
      });
    });

    it('存在しない日付は拒否されずロールオーバーする', () => {
      const [record] = parseTrainingLog(USER, '2/30 A店\nスクワット 100:5');

      // 2026年2月は28日まで。2/30は3/2として扱われる
      expect(record.date).toEqual(new Date('2026/3/2'));
    });
  });

  describe('フォーマットエラー', () => {
    it('1行目が日付+店舗でなければ1行目の不備として拒否する', () => {
      // isTrainingRecordが同じ正規表現で弾くため通常この経路には来ないが、
      // parseTrainingLogを直接呼べば到達する
      expect(parseErrorOf('おはよう\nスクワット 100:5')).toMatchObject({
        kind: 'first_line',
        line: 1,
      });
    });

    it('種目名だけでセットが無い行は、その行番号つきで拒否する', () => {
      expect(parseErrorOf('4/26 A店\nスクワット')).toMatchObject({
        kind: 'workout_line',
        line: 2,
      });
    });

    it('読めない種目行が下のほうにあってもその行を指す', () => {
      expect(parseErrorOf('4/26 A店\nスクワット 100:5\nベンチ 60:10\nデッドリフト')).toMatchObject({
        kind: 'workout_line',
        line: 4,
      });
    });

    it('重量・回数が数値でない行は、種目行の不備とは区別する', () => {
      expect(parseErrorOf('4/26 A店\nスクワット 重い:たくさん')).toMatchObject({
        kind: 'set_format',
        line: 2,
      });
    });

    it('コロンが無いセットも重量・回数の不備として扱う', () => {
      expect(parseErrorOf('4/26 A店\nスクワット 100:5\nベンチ 60')).toMatchObject({
        kind: 'set_format',
        line: 3,
      });
    });
  });
});
