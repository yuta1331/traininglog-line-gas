// TypeScript: Service to manage user authorization for Google Apps Script

import { CONFIG } from '../config';

/**
 * Load allowed user IDs from the UserList sheet.
 * @returns List of authorized user IDs
 */
export function loadAllowedUserIds(): string[] {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME_USERS);
  if (!sheet) {
    throw new Error(`Sheet ${CONFIG.SHEET_NAME_USERS} not found.`);
  }
  const values = sheet.getDataRange().getValues();
  return values.slice(1).map(row => row[0]).filter(id => !!id);
}
