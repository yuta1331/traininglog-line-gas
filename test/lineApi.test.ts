import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPropertiesPort, setPropertiesPort } from '../src/config';
import { callLineApi } from '../src/services/lineApi';
import { takeLogs } from './setup';

// callLineApiが直接触るGASグローバルはUrlFetchAppのみ（このファイル内だけでスタブする）。
// CONFIG経由で間接的に触るPropertiesServiceは、config.tsのport差し替えで解決する（#35）。
beforeEach(() => {
  setPropertiesPort((key) => (key === 'LINE_CHANNEL_ACCESS_TOKEN' ? 'test-token' : null));
});

afterEach(() => {
  resetPropertiesPort();
  delete (globalThis as any).UrlFetchApp;
});

describe('callLineApi', () => {
  it('2xxレスポンスなら失敗ログを出さず、ok型で結果を返す', () => {
    (globalThis as any).UrlFetchApp = {
      fetch: vi.fn(() => ({
        getResponseCode: () => 200,
        getContentText: () => '{}',
      })),
    };

    const result = callLineApi('post', '/v2/bot/message/reply', { replyToken: 't' }, 'Reply');

    expect(takeLogs().join('\n')).not.toContain('failed');
    expect(result).toEqual({ type: 'ok', statusCode: 200, body: '{}' });
  });

  it('4xx/5xxレスポンスならステータスとレスポンス本文を失敗ログに残し（例外は投げない）、error型で結果を返す', () => {
    (globalThis as any).UrlFetchApp = {
      fetch: vi.fn(() => ({
        getResponseCode: () => 400,
        getContentText: () => '{"message":"invalid replyToken"}',
      })),
    };

    const result = callLineApi('post', '/v2/bot/message/reply', { replyToken: 't' }, 'Reply');

    const log = takeLogs().join('\n');
    expect(log).toContain('400');
    expect(log).toContain('invalid replyToken');
    expect(result).toEqual({
      type: 'error',
      statusCode: 400,
      body: '{"message":"invalid replyToken"}',
    });
  });

  it('fetch自体が例外を投げても握り潰さずログに残し（reply側の失敗が黙って落ちない: #34）、error型でstatusCode/bodyはnullを返す', () => {
    (globalThis as any).UrlFetchApp = {
      fetch: vi.fn(() => {
        throw new Error('DNS error: api.line.me');
      }),
    };

    const result = callLineApi('post', '/v2/bot/message/reply', { replyToken: 't' }, 'Reply');

    expect(takeLogs().join('\n')).toContain('DNS error: api.line.me');
    expect(result).toEqual({ type: 'error', statusCode: null, body: null });
  });

  it('methodに指定した値（get）がそのままfetchのoptionsへ渡る', () => {
    const fetch = vi.fn(
      (_url: string, _options?: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions) => ({
        getResponseCode: () => 200,
        getContentText: () => '{"active":true}',
      }),
    );
    (globalThis as any).UrlFetchApp = { fetch };

    callLineApi('get', '/v2/bot/channel/webhook/endpoint', undefined, 'Get webhook endpoint');

    expect(fetch).toHaveBeenCalledTimes(1);
    const options = fetch.mock.calls[0][1];
    expect(options?.method).toBe('get');
  });

  it('methodに指定した値（put）がそのままfetchのoptionsへ渡り、payloadも含まれる', () => {
    const fetch = vi.fn(
      (_url: string, _options?: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions) => ({
        getResponseCode: () => 200,
        getContentText: () => '{}',
      }),
    );
    (globalThis as any).UrlFetchApp = { fetch };

    callLineApi('put', '/v2/bot/channel/webhook/endpoint', { endpoint: 'https://example.com' }, 'Set webhook endpoint');

    const options = fetch.mock.calls[0][1];
    expect(options?.method).toBe('put');
    expect(options?.payload).toBe(JSON.stringify({ endpoint: 'https://example.com' }));
  });

  it('payloadを省略（undefined）した場合、fetchのoptionsにpayloadキーを立てない', () => {
    const fetch = vi.fn(
      (_url: string, _options?: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions) => ({
        getResponseCode: () => 200,
        getContentText: () => '{}',
      }),
    );
    (globalThis as any).UrlFetchApp = { fetch };

    callLineApi('get', '/v2/bot/channel/webhook/endpoint', undefined, 'Get webhook endpoint');

    const options = fetch.mock.calls[0][1];
    expect(options && 'payload' in options).toBe(false);
    expect(options && 'contentType' in options).toBe(false);
  });
});
