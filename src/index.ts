// TypeScript: Google Apps ScriptでLINE Webhookを処理するメインエントリーポイント

import { CONFIG } from './config';
import { loadAllowedUserIds } from './services/user';
import { isTrainingRecord, parseTrainingLog } from './services/parse';
import { loadTrainingRecords, convertRecordsToJson, saveJsonToDrive } from './services/export';
import { replyToUser } from './services/reply';

/**
 * doPostはLINE WebhookのHTTP POSTエンドポイントです
 * @param e POSTリクエストを含むイベントオブジェクト
 * @returns 成功または失敗を示すTextOutput
 */
function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  try {
    // POSTボディをJSONにパース
    const json = JSON.parse(e.postData.contents);

    const events: any[] = json.events;
    if (!events || events.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'no events' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const allowedUserIds = loadAllowedUserIds();
    events.forEach((event: any) => {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const messageText = event.message.text;
        const replyToken = event.replyToken;

        if (!allowedUserIds.includes(userId)) {
          Logger.log(`Unauthorized user: ${userId}`);
          // 必要に応じて、ここでユーザーに返信することもできます
          return;
        }

        // (1) "json書き出し"コマンドの処理
        if (messageText === 'json書き出し') {
          try {
            const records = loadTrainingRecords();
            const jsonData = convertRecordsToJson(records);
            const fileUrl = saveJsonToDrive(jsonData);

            replyToUser(replyToken, `✅ Jsonファイルを作成しました！\nこちらからダウンロードできます👇\n${fileUrl}`);
          } catch (error) {
            if (error instanceof Error) {
              Logger.log(`Error during JSON export: ${error.message}`);
              replyToUser(replyToken, `❌ エクスポート失敗: ${error.message}`);
            } else {
              Logger.log('Unknown error during JSON export');
              replyToUser(replyToken, '❌ エクスポート失敗: Unknown error');
            }
          }
          return;
        }

        // (2) トレーニング記録メッセージの処理
        if (isTrainingRecord(messageText)) {
          try {
            const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME_LOG);
            if (!sheet) {
              throw new Error(`Sheet ${CONFIG.SHEET_NAME_LOG} not found.`);
            }

            const records = parseTrainingLog(userId, messageText);
            
            // 複数行をまとめて追加（パフォーマンス改善）
            const COLUMN_COUNT = 7; // userId, date, shop, event, weight, reps, topSet
            const rows = records.map(record => [
              record.userId,
              record.date,
              record.shop,
              record.event,
              record.weight,
              record.reps,
              record.topSet ? 1 : ''
            ]);
            
            if (rows.length > 0) {
              // LockServiceを使用して同時実行時の競合を防止
              const lock = LockService.getScriptLock();
              try {
                // 30秒間ロックを取得を試みる
                lock.waitLock(30000);
                const lastRow = sheet.getLastRow();
                sheet.getRange(lastRow + 1, 1, rows.length, COLUMN_COUNT).setValues(rows);
              } finally {
                // ロックを必ず解放
                lock.releaseLock();
              }
            }

            // 登録成功時の返信
            replyToUser(replyToken, '登録したよ！💪');

          } catch (err) {
            let errorMessage = 'フォーマット間違ってるよ！📝';
            if (err instanceof Error) {
              errorMessage += `-> ${err.message}`;
            }
            // フォーマットエラー発生時の返信
            replyToUser(replyToken, errorMessage);
          }
        } else {
          // 通常のメッセージには返信しない
          Logger.log(`Normal message from ${userId} - no reply.`);
        }
      }
    });

    // 成功レスポンスを返す
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    if (error instanceof Error) {
      Logger.log(`Error: ${error.message}`);
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.message }))
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      Logger.log('Unknown error occurred.');
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown error' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
}

// Google Apps ScriptのグローバルスコープにdoPostを公開
(globalThis as any).doPost = doPost;
