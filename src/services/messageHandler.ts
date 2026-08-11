// テキストメッセージ1通を処理し、処理結果を返すmodule
//
// 「許可ユーザー判定 → 自動既読 → コマンド判別 → 記録の保存 or JSON書き出し」の
// 順序そのものが仕様であり、それを内側に閉じ込めることがこのmoduleの存在理由。
// LINEのWebhookペイロードの形は知らない（doPostが整形して渡す）。
// LINEに返す文言も持たない（doPost側の文言化関数が担う）。

import { isTrainingRecord, parseTrainingLog, TrainingRecord } from './parse';
import { StoreBusyError, StoreError } from './trainingLogStore';

/** JSON書き出しを起動するコマンド */
export const EXPORT_COMMAND = 'json書き出し';

export type MessageInput = {
  userId: string;
  text: string;
  /** LINE公式アカウントのチャットがOFFのときは届かない */
  markAsReadToken?: string;
};

/** 何が起きたかを表す。文言は含まない */
export type MessageResult =
  | { type: 'saved' }
  | { type: 'invalid_format'; detail?: string }
  | { type: 'store_error'; detail: string }
  | { type: 'busy' }
  | { type: 'unauthorized' }
  | { type: 'ignored' }
  | { type: 'export_ok'; url: string }
  | { type: 'export_failed'; detail?: string };

export type MessageHandlerDeps = {
  allowedUserIds: string[];
  appendTrainingRecords: (records: TrainingRecord[]) => void;
  markAsRead: (markAsReadToken: string | undefined) => void;
  /** 記録をJSONにしてDriveに保存し、ダウンロードURLを返す */
  exportJson: () => string;
};

/**
 * テキストメッセージ1通を処理します
 * @param input doPostが整形したメッセージ
 * @param deps 外部に触れる処理。テストでは差し替える
 * @returns 処理結果
 */
export function handleTextMessage(input: MessageInput, deps: MessageHandlerDeps): MessageResult {
  const { userId, text } = input;

  if (!deps.allowedUserIds.includes(userId)) {
    Logger.log(`Unauthorized user: ${userId}`);
    return { type: 'unauthorized' };
  }

  // 既読を付けるのは許可ユーザーのメッセージだけ。この順序が仕様
  deps.markAsRead(input.markAsReadToken);

  if (text === EXPORT_COMMAND) {
    return exportToJson(deps);
  }

  if (!isTrainingRecord(text)) {
    Logger.log(`Normal message from ${userId} - no reply.`);
    return { type: 'ignored' };
  }

  return saveTrainingRecords(input, deps);
}

function exportToJson(deps: MessageHandlerDeps): MessageResult {
  try {
    return { type: 'export_ok', url: deps.exportJson() };
  } catch (error) {
    if (error instanceof Error) {
      Logger.log(`Error during JSON export: ${error.message}`);
      return { type: 'export_failed', detail: error.message };
    }
    Logger.log('Unknown error during JSON export');
    return { type: 'export_failed' };
  }
}

function saveTrainingRecords(input: MessageInput, deps: MessageHandlerDeps): MessageResult {
  try {
    const records = parseTrainingLog(input.userId, input.text);

    // 種目行が1つも無いと空配列になるが、現状はそれでも成功として返す（#31）
    if (records.length > 0) {
      deps.appendTrainingRecords(records);
    }

    return { type: 'saved' };
  } catch (error) {
    if (error instanceof StoreBusyError) {
      // ロック取得失敗のログは記録ストア側が出している
      return { type: 'busy' };
    }
    if (error instanceof StoreError) {
      return { type: 'store_error', detail: error.message };
    }
    return {
      type: 'invalid_format',
      detail: error instanceof Error ? error.message : undefined,
    };
  }
}
