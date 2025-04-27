// TypeScript: Main entry point for handling LINE Webhook in Google Apps Script

import { CONFIG } from './config';
import { loadAllowedUserIds } from './services/user';
import { isTrainingRecord, parseTrainingLog } from './services/parse';

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

        if (!allowedUserIds.includes(userId)) {
          Logger.log(`Unauthorized user: ${userId}`);
          // Optional: You could reply to user here if you want
          return;
        }

        if (isTrainingRecord(messageText)) {
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
