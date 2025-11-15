// スクリプトプロパティから設定値を取得するヘルパー関数

/**
 * スクリプトプロパティから指定されたキーの値を取得します
 * @param key スクリプトプロパティのキー
 * @returns 設定値
 * @throws キーが存在しない場合はエラーをスロー
 */
function getScriptProperty(key: string): string {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error(`スクリプトプロパティ '${key}' が設定されていません。`);
  }
  return value;
}

/**
 * 設定値を提供するオブジェクト
 * すべての値はスクリプトプロパティから取得されます
 */
export const CONFIG = {
  get SPREADSHEET_ID(): string {
    return getScriptProperty('SPREADSHEET_ID');
  },
  get SHEET_NAME_LOG(): string {
    return getScriptProperty('SHEET_NAME_LOG');
  },
  get SHEET_NAME_USERS(): string {
    return getScriptProperty('SHEET_NAME_USERS');
  },
  get JSON_FOLDER_ID(): string {
    return getScriptProperty('JSON_FOLDER_ID');
  },
  get JSON_FILE_NAME(): string {
    return getScriptProperty('JSON_FILE_NAME');
  },
  get LINE_CHANNEL_ACCESS_TOKEN(): string {
    return getScriptProperty('LINE_CHANNEL_ACCESS_TOKEN');
  },
};
