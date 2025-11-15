// TypeScript: JSONエクスポートのためのサービス

import { CONFIG } from '../config';

export type TrainingLogRow = {
  userId: string;
  date: Date;
  shop: string;
  event: string;
  weight: number;
  reps: number;
  topSet: boolean;
};


/**
 * スプレッドシートからトレーニング記録を読み込みます
 * @returns {TrainingLogRow[]} トレーニングログ記録の配列
 */
export function loadTrainingRecords(): TrainingLogRow[] {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME_LOG);
  if (!sheet) {
    throw new Error(`Sheet ${CONFIG.SHEET_NAME_LOG} not found.`);
  }

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    // ヘッダーのみ存在する場合
    return [];
  }

  const records: TrainingLogRow[] = values.slice(1).map(row => {
    return {
      userId: row[0],
      date: new Date(row[1]),
      shop: row[2],
      event: row[3],
      weight: Number(row[4]),
      reps: Number(row[5]),
      topSet: row[6] === 1,
    };
  });

  return records;
}


/**
 * フラットなトレーニング記録を構造化されたJSON形式に変換します
 * @param records TrainingLogRowの配列
 * @returns JSON形式の配列
 */
export function convertRecordsToJson(records: TrainingLogRow[]): any[] {
  // 日付+店舗でグループ化するためのマップ
  const grouped: Record<string, { date: string; location: string; exercises: Record<string, { name: string; sets: { weight: number; reps: number; topSetFlag: number; }[] }> }> = {};

  records.forEach(record => {
    const dateStr = Utilities.formatDate(record.date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const key = `${dateStr}_${record.shop}`;

    if (!grouped[key]) {
      grouped[key] = {
        date: dateStr,
        location: record.shop,
        exercises: {},
      };
    }

    if (!grouped[key].exercises[record.event]) {
      grouped[key].exercises[record.event] = {
        name: record.event,
        sets: [],
      };
    }

    grouped[key].exercises[record.event].sets.push({
      weight: record.weight,
      reps: record.reps,
      topSetFlag: record.topSet ? 1 : 0,
    });
  });

  // 最終的な配列に平坦化
  return Object.values(grouped).map(entry => ({
    date: entry.date,
    location: entry.location,
    exercises: Object.values(entry.exercises),
  }));
}


/**
 * JSONデータをファイルとしてGoogle Driveに保存します
 * - フォルダに同名のファイルが存在する場合は置き換えられます
 * - ファイルは「リンクを知っている全員」が閲覧可能に設定されます
 * @param jsonData - 保存するJSONオブジェクト
 * @returns 保存されたファイルの共有可能なURL
 */
export function saveJsonToDrive(jsonData: any): string {
  const folder = DriveApp.getFolderById(CONFIG.JSON_FOLDER_ID);

  // 既存ファイルが存在する場合は削除
  const files = folder.getFilesByName(CONFIG.JSON_FILE_NAME);
  while (files.hasNext()) {
    const file = files.next();
    file.setTrashed(true);
  }

  // 新しいファイルを作成
  const blob = Utilities.newBlob(
    JSON.stringify(jsonData, null, 2),
    'application/json',
    CONFIG.JSON_FILE_NAME
  );
  const file = folder.createFile(blob);

  // 権限設定: リンクを知っている全員が閲覧可能
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return file.getUrl();
}
