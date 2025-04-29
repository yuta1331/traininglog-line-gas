// TypeScript: Service for reading training records from spreadsheet

import { CONFIG } from '../config';
import { TrainingLogRow } from './export';

/**
 * Read training records from the spreadsheet.
 * @returns Array of TrainingLogRow objects
 */
export function readTrainingRecords(): TrainingLogRow[] {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME_LOG);
  if (!sheet) {
    throw new Error(`Sheet ${CONFIG.SHEET_NAME_LOG} not found.`);
  }

  const values = sheet.getDataRange().getValues();
  const records: TrainingLogRow[] = [];

  values.forEach(row => {
    const [userId, date, shop, event, weight, reps, topSet] = row;

    // Skip rows with missing essential fields
    if (userId && date && shop && event && weight != null && reps != null) {
      records.push({
        userId: String(userId),
        date: new Date(date),
        shop: String(shop),
        event: String(event),
        weight: Number(weight),
        reps: Number(reps),
        topSet
      });
    }
  });

  return records;
}
