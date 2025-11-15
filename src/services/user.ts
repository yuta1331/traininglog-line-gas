// TypeScript: Google Apps Scriptのユーザー認証を管理するサービス

import { CONFIG } from '../config';

/**
 * UserListシートから許可されたユーザーIDを読み込みます
 * @returns 認証されたユーザーIDのリスト
 */
export function loadAllowedUserIds(): string[] {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME_USERS);
  if (!sheet) {
    throw new Error(`Sheet ${CONFIG.SHEET_NAME_USERS} not found.`);
  }
  const values = sheet.getDataRange().getValues();
  return values.slice(1).map(row => row[0]).filter(id => !!id);
}
