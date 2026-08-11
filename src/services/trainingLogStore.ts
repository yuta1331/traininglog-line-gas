// トレーニング記録の行スキーマと、記録ストア（TrainingLogシート）への読み書きを持つmodule
//
// 列順・record⇄rowの変換をここに閉じ込める。書き込み側・読み取り側の両方が
// recordToRow / rowToRecordを通ることで、列順を知る呼び出し側をゼロにする（#33）。
//
// SpreadsheetAppとLockServiceへの到達点はTrainingLogStoreDepsというportにまとめ、
// 本番用（defaultDeps）とテスト用のin-memory実装を差し替え可能にする（#35）。
// 排他が守っている不変条件は「getLastRowとsetValuesの間に他の実行が割り込まないこと」で、
// これは記録ストアの関心。ネットワークI/Oを排他の内側に入れてはならない。

import { CONFIG } from '../config';
import { TrainingRecord } from './parse';

/** シートが見つからない、書き込み・読み取りに失敗したなど、記録ストア側の障害 */
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

/** TrainingLogシートの1行。列順の知識はrecordToRow / rowToRecordだけが持つ */
type LogRow = unknown[];

/**
 * 1件のトレーニング記録をTrainingLogシートの1行に変換します
 * @param record トレーニング記録
 * @returns シートに書き込む行（userId, date, shop, event, weight, reps, topSet）
 */
export function recordToRow(record: TrainingRecord): LogRow {
  return [
    record.userId,
    record.date,
    record.shop,
    record.event,
    record.weight,
    record.reps,
    record.topSet ? 1 : '',
  ];
}

/**
 * TrainingLogシートの1行をトレーニング記録に変換します
 * @param row シートから読み取った行
 * @returns トレーニング記録
 */
export function rowToRecord(row: LogRow): TrainingRecord {
  return {
    userId: String(row[0]),
    date: new Date(row[1] as string | number | Date),
    shop: String(row[2]),
    event: String(row[3]),
    weight: Number(row[4]),
    reps: Number(row[5]),
    topSet: row[6] === 1,
  };
}

/** trainingLogStoreが必要とするシート操作の最小限。GAS Sheetは構造的にこれを満たす */
type LogSheet = {
  getLastRow(): number;
  getRange(row: number, column: number, numRows: number, numColumns: number): { setValues(values: LogRow[]): void };
  getDataRange(): { getValues(): LogRow[] };
};

/** trainingLogStoreがGASへ到達する経路。テストではin-memoryなportに差し替える（#35） */
export type TrainingLogStoreDeps = {
  getSheet: () => LogSheet | null;
  withLock: <T>(timeoutMs: number, fn: () => T) => T;
};

const defaultDeps: TrainingLogStoreDeps = {
  getSheet: () => SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME_LOG),
  withLock: (timeoutMs, fn) => {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(timeoutMs);
    } catch (error) {
      Logger.log(`Failed to acquire lock: ${error}`);
      throw new StoreBusyError('Failed to acquire script lock.');
    }
    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  },
};

/**
 * トレーニング記録をログシートの末尾にまとめて追記します
 * @param records 追記するトレーニング記録。空配列なら何もしません
 * @param deps GASへの到達点。省略時は本番用のSpreadsheet/Lock adapterを使う
 * @throws {StoreError} シートが見つからない場合
 * @throws {StoreBusyError} ロックを取得できなかった場合
 */
export function appendTrainingRecords(records: TrainingRecord[], deps: TrainingLogStoreDeps = defaultDeps): void {
  if (records.length === 0) {
    return;
  }

  const sheet = deps.getSheet();
  if (!sheet) {
    throw new StoreError('Training log sheet not found.');
  }

  const rows = records.map(recordToRow);

  deps.withLock(LOCK_TIMEOUT_MS, () => {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
  });
}

/**
 * ログシートからトレーニング記録を読み込みます
 * @param deps GASへの到達点。省略時は本番用のSpreadsheet adapterを使う
 * @returns トレーニング記録の配列
 * @throws {StoreError} シートが見つからない場合
 */
export function loadTrainingRecords(deps: TrainingLogStoreDeps = defaultDeps): TrainingRecord[] {
  const sheet = deps.getSheet();
  if (!sheet) {
    throw new StoreError('Training log sheet not found.');
  }

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    // ヘッダーのみ存在する場合
    return [];
  }

  return values.slice(1).map(rowToRecord);
}
