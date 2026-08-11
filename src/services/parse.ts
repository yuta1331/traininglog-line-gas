// TypeScript: トレーニングログメッセージのパースと処理を行うサービス

/** パースに失敗した理由の種別 */
export type ParseErrorKind = 'first_line' | 'workout_line' | 'set_format';

/** メッセージのどこがどう読めなかったかを持つエラー */
export class ParseError extends Error {
  readonly kind: ParseErrorKind;
  /** ユーザーから見た行番号（1始まり） */
  readonly line: number;

  constructor(kind: ParseErrorKind, line: number) {
    super(`${kind} at line ${line}`);
    this.name = 'ParseError';
    this.kind = kind;
    this.line = line;
  }
}

/**
 * 単一のトレーニング記録を表すデータ構造
 */
export type TrainingRecord = {
  userId: string;
  date: Date;
  shop: string;
  event: string;
  weight: number;
  reps: number;
  topSet: boolean;
};


/**
 * 指定されたメッセージが期待されるトレーニング記録フォーマットに従っているかチェックします
 * @param message LINEからのテキストメッセージ
 * @returns メッセージがトレーニング記録の場合はtrue、そうでない場合はfalse
 */
export function isTrainingRecord(message: string): boolean {
  const firstLine = message.split('\n')[0].trim();
  const regex = /^(\d{1,4}\/)?(\d{1,2})\/(\d{1,2})\s+(.+)$/;
  return regex.test(firstLine);
}


/**
 * トレーニングログメッセージを構造化された記録のリストにパースします
 * @param userId LINE ユーザーID
 * @param message 生のトレーニングログテキスト
 * @returns 構造化されたTrainingRecordオブジェクトの配列
 */
export function parseTrainingLog(userId: string, message: string): TrainingRecord[] {
  const lines = message.trim().split('\n').map(line => line.trim());
  const [dateShopLine, ...workoutLines] = lines;

  const dateShopMatch = dateShopLine.match(/^(\d{1,4}\/)?(\d{1,2})\/(\d{1,2})\s+(.+)$/);
  if (!dateShopMatch) {
    throw new ParseError('first_line', 1);
  }

  let year: number;
  if (dateShopMatch[1]) {
    year = parseInt(dateShopMatch[1].replace('/', ''), 10);
  } else {
    year = new Date().getFullYear();
  }
  const month = dateShopMatch[2];
  const day = dateShopMatch[3];
  const shop = dateShopMatch[4];

  const date = new Date(`${year}/${month}/${day}`);

  const records: TrainingRecord[] = [];

  workoutLines.forEach((line, index) => {
    // 1行目が日付+店舗なので、種目行はユーザーから見て2行目から始まる
    const lineNumber = index + 2;

    // 空行はその位置のまま読み飛ばす（#36）。filterで除去すると後続行の行番号がずれるため、
    // ここで早期returnしてindexは変えない
    if (line === '') return;

    const [eventName, setsText] = line.split(/\s(.+)/);
    if (!setsText) throw new ParseError('workout_line', lineNumber);

    const sets = setsText.split(',').map(pair => {
      const [weightStr, repsStr] = pair.split(':');
      const weight = parseFloat(weightStr);
      const reps = parseInt(repsStr, 10);
      if (isNaN(weight) || isNaN(reps)) {
        throw new ParseError('set_format', lineNumber);
      }
      return { weight, reps };
    });

    // 0回のセットはトップセット候補から除外する。全セットが0回なら、トップセットは1つも立たない
    let topSetIndex: number | null = null;
    for (let idx = 0; idx < sets.length; idx++) {
      const set = sets[idx];
      if (set.reps <= 0) continue;

      if (topSetIndex === null) {
        topSetIndex = idx;
        continue;
      }

      const top = sets[topSetIndex];
      if (set.weight > top.weight || (set.weight === top.weight && set.reps > top.reps)) {
        topSetIndex = idx;
      }
    }

    sets.forEach((set, idx) => {
      records.push({
        userId,
        date,
        shop,
        event: eventName,
        weight: set.weight,
        reps: set.reps,
        topSet: idx === topSetIndex,
      });
    });
  });

  return records;
}
