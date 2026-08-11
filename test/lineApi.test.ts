import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPropertiesPort, setPropertiesPort } from '../src/config';
import { postToLine } from '../src/services/lineApi';
import { takeLogs } from './setup';

// postToLineが直接触るGASグローバルはUrlFetchAppのみ（このファイル内だけでスタブする）。
// CONFIG経由で間接的に触るPropertiesServiceは、config.tsのport差し替えで解決する（#35）。
beforeEach(() => {
  setPropertiesPort((key) => (key === 'LINE_CHANNEL_ACCESS_TOKEN' ? 'test-token' : null));
});

afterEach(() => {
  resetPropertiesPort();
  delete (globalThis as any).UrlFetchApp;
});

describe('postToLine', () => {
  it('2xxレスポンスなら失敗ログを出さない', () => {
    (globalThis as any).UrlFetchApp = {
      fetch: vi.fn(() => ({
        getResponseCode: () => 200,
        getContentText: () => '{}',
      })),
    };

    postToLine('/v2/bot/message/reply', { replyToken: 't' }, 'Reply');

    expect(takeLogs().join('\n')).not.toContain('failed');
  });

  it('4xx/5xxレスポンスならステータスとレスポンス本文を失敗ログに残す（例外は投げない）', () => {
    (globalThis as any).UrlFetchApp = {
      fetch: vi.fn(() => ({
        getResponseCode: () => 400,
        getContentText: () => '{"message":"invalid replyToken"}',
      })),
    };

    expect(() => postToLine('/v2/bot/message/reply', { replyToken: 't' }, 'Reply')).not.toThrow();

    const log = takeLogs().join('\n');
    expect(log).toContain('400');
    expect(log).toContain('invalid replyToken');
  });

  it('fetch自体が例外を投げても握り潰さずログに残す（reply側の失敗が黙って落ちない: #34）', () => {
    (globalThis as any).UrlFetchApp = {
      fetch: vi.fn(() => {
        throw new Error('DNS error: api.line.me');
      }),
    };

    expect(() => postToLine('/v2/bot/message/reply', { replyToken: 't' }, 'Reply')).not.toThrow();

    expect(takeLogs().join('\n')).toContain('DNS error: api.line.me');
  });
});
