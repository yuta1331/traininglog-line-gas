// TypeScript: Service for exporting json

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
 * Load training records from the Spreadsheet.
 * @returns {TrainingLogRow[]} Array of training log records
 */
export function loadTrainingRecords(): TrainingLogRow[] {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME_LOG);
  if (!sheet) {
    throw new Error(`Sheet ${CONFIG.SHEET_NAME_LOG} not found.`);
  }

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    // Only header exists
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
 * Convert flat training records into structured JSON format.
 * @param records Array of TrainingLogRow
 * @returns JSON-ready array
 */
export function convertRecordsToJson(records: TrainingLogRow[]): any[] {
  // Map to group by date + shop
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

  // Flatten into final array
  return Object.values(grouped).map(entry => ({
    date: entry.date,
    location: entry.location,
    exercises: Object.values(entry.exercises),
  }));
}


/**
 * Save JSON data to Google Drive as a file.
 * - If a file with the same name exists in the folder, it will be replaced.
 * - The file will be set to "Anyone with the link" can view.
 * @param jsonData - The JSON object to save
 * @returns The sharable URL to the saved file
 */
export function saveJsonToDrive(jsonData: any): string {
  const folder = DriveApp.getFolderById(CONFIG.JSON_FOLDER_ID);

  // Delete existing file if exists
  const files = folder.getFilesByName(CONFIG.JSON_FILE_NAME);
  while (files.hasNext()) {
    const file = files.next();
    file.setTrashed(true);
  }

  // Create new file
  const blob = Utilities.newBlob(
    JSON.stringify(jsonData, null, 2),
    'application/json',
    CONFIG.JSON_FILE_NAME
  );
  const file = folder.createFile(blob);

  // Set permissions: Anyone with the link can view
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return file.getUrl();
}
