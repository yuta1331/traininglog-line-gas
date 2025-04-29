// TypeScript: Main entry point for handling LINE Webhook in Google Apps Script

import { CONFIG } from './config';
import { loadAllowedUserIds } from './services/user';
import { isTrainingRecord, parseTrainingLog } from './services/parse';
import { loadTrainingRecords, convertRecordsToJson, saveJsonToDrive } from './services/export';
import { replyToUser } from './services/reply';

/**
 * doPost is the HTTP POST endpoint for LINE Webhook.
 * @param e Event object containing the POST request
 * @returns TextOutput indicating success or failure
 */
function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  try {
    // Parse the POST body into JSON
    const json = JSON.parse(e.postData.contents);

    const events: any[] = json.events;
    if (!events || events.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'no events' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME_LOG);
    if (!sheet) {
      throw new Error(`Sheet ${CONFIG.SHEET_NAME_LOG} not found.`);
    }

    const allowedUserIds = loadAllowedUserIds();
    events.forEach((event: any) => {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const messageText = event.message.text;
        const replyToken = event.replyToken;

        if (!allowedUserIds.includes(userId)) {
          Logger.log(`Unauthorized user: ${userId}`);
          // Optional: You could reply to user here if you want
          return;
        }

        // (1) Handle "json書き出し" command
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

        // (2) Handle training record messages
        if (isTrainingRecord(messageText)) {
          try {
            const records = parseTrainingLog(userId, messageText);
            records.forEach(record => {
              sheet.appendRow([
                record.userId,
                record.date,
                record.shop,
                record.event,
                record.weight,
                record.reps,
                record.topSet ? 1 : ''
              ]);
            });

            // Reply when registration is successful
            replyToUser(replyToken, '登録したよ！💪');

          } catch (err) {
            let errorMessage = 'フォーマット間違ってるよ！📝';
            if (err instanceof Error) {
              errorMessage += `-> ${err.message}`;
            }
            // Reply when format error occurs
            replyToUser(replyToken, errorMessage);
          }
        } else {
          // Do not reply for normal messages
          Logger.log(`Normal message from ${userId} - no reply.`);
        }
      }
    });

    // Return a successful response
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

// Expose doPost globally for Google Apps Script
(globalThis as any).doPost = doPost;
