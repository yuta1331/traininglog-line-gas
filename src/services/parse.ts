// TypeScript: トレーニングログメッセージのパースと処理を行うサービス

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
    throw new Error('Invalid first line format');
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

  workoutLines.forEach(line => {
    const [eventName, setsText] = line.split(/\s(.+)/);
    if (!setsText) throw new Error('Invalid workout line format');

    const sets = setsText.split(',').map(pair => {
      const [weightStr, repsStr] = pair.split(':');
      const weight = parseFloat(weightStr);
      const reps = parseInt(repsStr, 10);
      if (isNaN(weight) || isNaN(reps)) {
        throw new Error('Invalid weight or reps format');
      }
      return { weight, reps };
    });

    let topSetIndex = 0;
    sets.forEach((set, idx) => {
      const top = sets[topSetIndex];
      if (set.weight > top.weight || (set.weight === top.weight && set.reps > top.reps)) {
        topSetIndex = idx;
      }
    });

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
