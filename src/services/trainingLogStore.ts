// トレーニング記録をスプレッドシートに追記するmodule
//
// 列順・排他・setValuesをここに閉じ込める。
// 排他が守っている不変条件は「getLastRowとsetValuesの間に他の実行が割り込まないこと」で、
// これは記録ストアの関心。ネットワークI/Oを排他の内側に入れてはならない。

import { CONFIG } from '../config';
import { TrainingRecord } from './parse';

/** シートが見つからない、書き込みに失敗したなど、記録ストア側の障害 */
export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreError';
  }
}

/** 他の実行がロックを保持していて追記できなかった */
export class StoreBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreBusyError';
  }
}

const LOCK_TIMEOUT_MS = 30000;

/**
 * トレーニング記録をログシートの末尾にまとめて追記します
 * @param records 追記するトレーニング記録。空配列なら何もしません
 * @throws {StoreError} シートが見つからない場合
 * @throws {StoreBusyError} ロックを取得できなかった場合
 */
export function appendTrainingRecords(records: TrainingRecord[]): void {
  if (records.length === 0) {
    return;
  }

  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME_LOG);
  if (!sheet) {
    throw new StoreError(`Sheet ${CONFIG.SHEET_NAME_LOG} not found.`);
  }

  // userId, date, shop, event, weight, reps, topSet
  const rows = records.map((record) => [
    record.userId,
    record.date,
    record.shop,
    record.event,
    record.weight,
    record.reps,
    record.topSet ? 1 : '',
  ]);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_TIMEOUT_MS);
  } catch (error) {
    Logger.log(`Failed to acquire lock: ${error}`);
    throw new StoreBusyError('Failed to acquire script lock.');
  }

  try {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
}
