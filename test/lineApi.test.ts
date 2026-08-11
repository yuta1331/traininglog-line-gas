import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postToLine } from '../src/services/lineApi';
import { takeLogs } from './setup';

// postToLineが直接触るGASグローバル（UrlFetchApp）と、CONFIG経由で間接的に触る
// PropertiesServiceは、このファイル内だけでスタブする（setup.tsには足さない）。
function stubProperties(): void {
  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === 'LINE_CHANNEL_ACCESS_TOKEN' ? 'test-token' : null),
    }),
  };
}

beforeEach(() => {
  stubProperties();
});

afterEach(() => {
  delete (globalThis as any).PropertiesService;
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
