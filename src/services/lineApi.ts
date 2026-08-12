// LINE Messaging APIの呼び出しを1箇所に集約するadapter
//
// reply.ts / markAsRead.ts はどちらも同じ認証ヘッダーとfetchオプションを組み立てていたが、
// ステータス判定と失敗ログはmarkAsReadだけが行っていた（reply側は失敗が握り潰されていた: #34）。
// この2つの利用者を薄い呼び出しにし、判定とログをここに1箇所だけ持つ。
//
// GET/PUTも扱うのは、後続のWebhookトークン自動ローテーション（#32）が
// GET /v2/bot/channel/webhook/endpoint と PUT /v2/bot/channel/webhook/endpoint を叩くため。
// ここで別の関数を足さないこと（#34が潰した「LINE APIを叩く経路が2本」を再生産する）。

import { CONFIG } from '../config';

const LINE_API_BASE_URL = 'https://api.line.me';

/**
 * callLineApiの呼び出し結果
 *
 * ステータスコード・レスポンス本文がnullなのは例外発生時のみ。
 * `type`で成否を判別できるため、ボディの中身（空文字やnull）と成否を混同しません。
 */
export type LineApiResult =
  | { type: 'ok'; statusCode: number; body: string }
  | { type: 'error'; statusCode: number | null; body: string | null };

/**
 * LINE Messaging APIを呼び出します
 *
 * ステータスコードとネットワーク例外の両方をここで捕捉し、成否をログに残します。
 * 呼び出し元には例外を伝播させません（doPost側のイベント処理フローを変えないため）。
 * 例外発生時も戻り値で判別できるよう、ここでは決して例外を再スローしません。
 * @param method HTTPメソッド（'get' | 'post' | 'put'）
 * @param path APIのパス（例: '/v2/bot/message/reply'）
 * @param payload リクエストボディ。undefinedを渡した場合はリクエストにpayload・contentTypeの
 *   両キーを含めません（GETはボディを持たないため）
 * @param context ログに含める呼び出し元の説明（例: 'Reply to user'）
 * @returns 呼び出し結果。2xxなら`{type: 'ok', statusCode, body}`、
 *   4xx/5xxや例外時は`{type: 'error', statusCode, body}`（例外時はstatusCode/bodyともnull）
 */
export function callLineApi(
  method: 'get' | 'post' | 'put',
  path: string,
  payload: unknown,
  context: string,
): LineApiResult {
  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method,
    headers: {
      Authorization: `Bearer ${CONFIG.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    muteHttpExceptions: true,
  };

  // contentTypeはボディの形式を表すヘッダーなので、payloadと運命を共にする
  // （GETはボディを持たないため、どちらも付けない）
  if (payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  try {
    const response = UrlFetchApp.fetch(`${LINE_API_BASE_URL}${path}`, options);
    const statusCode = response.getResponseCode();
    const body = response.getContentText();

    if (statusCode >= 200 && statusCode < 300) {
      Logger.log(`${context} succeeded.`);
      return { type: 'ok', statusCode, body };
    }

    Logger.log(`${context} failed. Status: ${statusCode}, Response: ${body}`);
    return { type: 'error', statusCode, body };
  } catch (error) {
    if (error instanceof Error) {
      Logger.log(`${context} error: ${error.message}`);
    } else {
      Logger.log(`${context} error: Unknown error occurred.`);
    }
    return { type: 'error', statusCode: null, body: null };
  }
}
