// スクリプトプロパティから設定値を取得するヘルパー関数

/** スクリプトプロパティ相当の値を返すport。テストでは固定値のportに差し替える（#35） */
export type PropertiesPort = (key: string) => string | null;

const scriptPropertiesPort: PropertiesPort = (key) =>
  PropertiesService.getScriptProperties().getProperty(key);

let propertiesPort: PropertiesPort = scriptPropertiesPort;

/** テストからCONFIGの値を固定するためにportを差し替える */
export function setPropertiesPort(port: PropertiesPort): void {
  propertiesPort = port;
}

/** 本番用のScriptProperties portに戻す */
export function resetPropertiesPort(): void {
  propertiesPort = scriptPropertiesPort;
}

/**
 * スクリプトプロパティから指定されたキーの値を取得します
 * @param key スクリプトプロパティのキー
 * @returns 設定値
 * @throws キーが存在しない場合はエラーをスロー
 */
function getScriptProperty(key: string): string {
  const value = propertiesPort(key);
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
  /** 送信元トークン（ADR-0004）。カンマ区切りで1つ（"N"）または入れ替え中の2つ（"C,N"） */
  get WEBHOOK_TOKEN(): string {
    return getScriptProperty('WEBHOOK_TOKEN');
  },
};

/**
 * スクリプトプロパティ WEBHOOK_TOKEN を書き込みます
 *
 * このファイルは「PropertiesServiceへの唯一の到達点」（README.md）という不変条件を持つ。
 * トークンローテーション（services/tokenRotation.ts）はPropertiesServiceを直接触らず、
 * 必ずこの関数を経由して書き込む。読み取りは既存の`CONFIG.WEBHOOK_TOKEN`を使う。
 * @param value 書き込む値。通常時は1つ（"N"）、ローテーションの入れ替え中は2つ（"C,N"）
 */
export function setWebhookToken(value: string): void {
  PropertiesService.getScriptProperties().setProperty('WEBHOOK_TOKEN', value);
}
