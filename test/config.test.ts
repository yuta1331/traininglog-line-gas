import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG, resetPropertiesPort, setPropertiesPort } from '../src/config';

// CONFIGはPropertiesServiceを直接掴まず、差し替え可能なportを経由する（#35）。
// テストではsetPropertiesPortで固定値に差し替える。

afterEach(() => {
  resetPropertiesPort();
});

describe('CONFIG', () => {
  it('差し替えたportが返す値をそのまま返す', () => {
    setPropertiesPort((key) => (key === 'SPREADSHEET_ID' ? 'sheet-123' : null));

    expect(CONFIG.SPREADSHEET_ID).toBe('sheet-123');
  });

  it('キーごとに異なる値を返せる', () => {
    setPropertiesPort((key) => ({ SHEET_NAME_LOG: 'TrainingLog', SHEET_NAME_USERS: 'UserList' }[key] ?? null));

    expect(CONFIG.SHEET_NAME_LOG).toBe('TrainingLog');
    expect(CONFIG.SHEET_NAME_USERS).toBe('UserList');
  });

  it('portが値を返さなければエラーを投げる', () => {
    setPropertiesPort(() => null);

    expect(() => CONFIG.SPREADSHEET_ID).toThrow(/SPREADSHEET_ID/);
  });
});
