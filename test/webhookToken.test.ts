import { afterEach, describe, expect, it } from 'vitest';
import { generateWebhookToken, isValidWebhookToken } from '../src/services/webhookToken';

// isValidWebhookTokenはPropertiesServiceもCONFIGも読まない純粋関数。
// 呼び出し側（index.ts）がCONFIGから読んだ値を渡す（GASの外から回せるようにするため）。

// generateWebhookTokenが直接触るGASグローバルはUtilitiesのみ（このファイル内だけでスタブする）。
afterEach(() => {
  delete (globalThis as any).Utilities;
});

describe('isValidWebhookToken', () => {
  it('受信値がスクリプトプロパティの値と一致すれば通す（単一トークン）', () => {
    expect(isValidWebhookToken('secret-token', 'secret-token')).toBe(true);
  });

  it('受信値がスクリプトプロパティの値と一致しなければ通さない', () => {
    expect(isValidWebhookToken('wrong-token', 'secret-token')).toBe(false);
  });

  it('ローテーション入れ替え中（"C,N"）は旧トークンCでも新トークンNでも通す', () => {
    expect(isValidWebhookToken('C', 'C,N')).toBe(true);
    expect(isValidWebhookToken('N', 'C,N')).toBe(true);
  });

  it('プロパティ値の前後に空白があってもtrimしてから比較する（手入力の末尾スペース対策）', () => {
    expect(isValidWebhookToken('C', 'C , N')).toBe(true);
    expect(isValidWebhookToken('N', 'C , N')).toBe(true);
  });

  it('受信値がundefined（クエリパラメータ`t`未指定）なら常に通さない', () => {
    expect(isValidWebhookToken(undefined, 'secret-token')).toBe(false);
  });

  it('受信値が空文字なら常に通さない', () => {
    expect(isValidWebhookToken('', 'secret-token')).toBe(false);
  });

  it('プロパティ値が"a,"のように空要素を含んでいても、空の受信値は通さない', () => {
    expect(isValidWebhookToken('', 'a,')).toBe(false);
  });
});

describe('generateWebhookToken', () => {
  it('Utilities.getUuid()が返す値をそのまま返す', () => {
    (globalThis as any).Utilities = {
      getUuid: () => 'generated-uuid',
    };

    expect(generateWebhookToken()).toBe('generated-uuid');
  });
});
