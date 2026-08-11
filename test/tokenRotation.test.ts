import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractTokenFromUrl,
  replaceTokenInUrl,
  runTokenRotation,
  setupRotationTrigger,
  TokenRotationDeps,
} from '../src/services/tokenRotation';
import { LineApiResult } from '../src/services/lineApi';
import { takeLogs } from './setup';

// runTokenRotationはPropertiesService/UrlFetchApp/LockService/Utilitiesのいずれも
// 直接触らない純粋なdeps注入関数（messageHandler.tsのMessageHandlerDepsと同じ流儀）。
// GASグローバルは一切stubせず、depsを丸ごとvi.fn()等で差し替える。

// setupRotationTriggerが直接触るGASグローバルはScriptAppのみ（このファイル内だけでstubする。
// test/lineApi.test.tsの慣習に合わせる）。
afterEach(() => {
  delete (globalThis as any).ScriptApp;
});

function makeDeps(overrides: Partial<TokenRotationDeps> = {}): TokenRotationDeps {
  return {
    tryLock: vi.fn(() => true),
    releaseLock: vi.fn(),
    callLineApi: vi.fn(),
    readWebhookToken: vi.fn(() => 'property-value'),
    writeWebhookToken: vi.fn(),
    generateToken: vi.fn(() => 'new-token'),
    sleep: vi.fn(),
    ...overrides,
  };
}

function okGetResult(endpoint: string, active = true): LineApiResult {
  return { type: 'ok', statusCode: 200, body: JSON.stringify({ endpoint, active }) };
}

function okPutResult(): LineApiResult {
  return { type: 'ok', statusCode: 200, body: '{}' };
}

// extractTokenFromUrlはGASのURL/URLSearchParamsを使わない純粋関数。
// V8ランタイムにはどちらも存在しないため、文字列/正規表現で処理する（vitestはNode上で
// 動くのでURLを使っても通ってしまい、テストでは検出できない欠陥になる）。

describe('extractTokenFromUrl', () => {
  it('tパラメータの値を返す', () => {
    expect(extractTokenFromUrl('https://script.google.com/macros/s/xxx/exec?t=abc123')).toBe(
      'abc123',
    );
  });

  it('tが他のパラメータと混在していても正しく取れる（?a=1&t=xxxの形）', () => {
    expect(extractTokenFromUrl('https://example.com/exec?a=1&t=xyz')).toBe('xyz');
    expect(extractTokenFromUrl('https://example.com/exec?t=xyz&b=2')).toBe('xyz');
  });

  it('tパラメータが無ければundefinedを返す', () => {
    expect(extractTokenFromUrl('https://example.com/exec')).toBeUndefined();
    expect(extractTokenFromUrl('https://example.com/exec?a=1')).toBeUndefined();
  });

  it('URLエンコードされた値をデコードして返す', () => {
    expect(extractTokenFromUrl('https://example.com/exec?t=a%2Fb')).toBe('a/b');
  });
});

describe('replaceTokenInUrl', () => {
  it('tパラメータの値だけを新しい値に差し替える', () => {
    expect(replaceTokenInUrl('https://example.com/exec?t=old', 'new')).toBe(
      'https://example.com/exec?t=new',
    );
  });

  it('他のパラメータと混在していても、tだけを差し替えて残りを保持する（?a=1&t=xxxの形）', () => {
    expect(replaceTokenInUrl('https://example.com/exec?a=1&t=old&b=2', 'new')).toBe(
      'https://example.com/exec?a=1&t=new&b=2',
    );
  });

  it('新しい値をURLエンコードして埋め込む', () => {
    expect(replaceTokenInUrl('https://example.com/exec?t=old', 'a/b')).toBe(
      'https://example.com/exec?t=a%2Fb',
    );
  });
});

describe('runTokenRotation', () => {
  it('7手順を順序どおりに実行する（"C,N"に更新→PUT→sleep→"N"に刈り取り）', () => {
    const order: string[] = [];
    const deps = makeDeps({
      callLineApi: vi.fn((method: 'get' | 'put') => {
        if (method === 'get') {
          order.push('get');
          return okGetResult('https://example.com/exec?t=old-token');
        }
        order.push('put');
        return okPutResult();
      }),
      writeWebhookToken: vi.fn((value: string) => order.push(`write:${value}`)),
      sleep: vi.fn(() => order.push('sleep')),
      generateToken: vi.fn(() => 'new-token'),
    });

    runTokenRotation(deps);

    expect(order).toEqual(['get', 'write:old-token,new-token', 'put', 'sleep', 'write:new-token']);
    // sleepの時間そのものも固定する。120000（120秒）はキャッシュ遅延に対する防御の値そのものであり、
    // 呼ばれた事実だけでは短縮された回帰（例: 1000ms）を検出できない
    expect(deps.sleep).toHaveBeenCalledWith(120000);
    // ロックはfinallyで解放される。正常系でも確実に呼ばれること
    expect(deps.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('PUTが失敗したら刈り取らずthrowし、プロパティは"C,N"のまま残る', () => {
    const deps = makeDeps({
      callLineApi: vi.fn((method: 'get' | 'put') => {
        if (method === 'get') {
          return okGetResult('https://example.com/exec?t=old-token');
        }
        return { type: 'error', statusCode: 500, body: 'server error' } satisfies LineApiResult;
      }),
      generateToken: vi.fn(() => 'new-token'),
    });

    expect(() => runTokenRotation(deps)).toThrow();

    expect(deps.writeWebhookToken).toHaveBeenCalledTimes(1);
    expect(deps.writeWebhookToken).toHaveBeenCalledWith('old-token,new-token');
    expect(deps.sleep).not.toHaveBeenCalled();
    // finallyでロックが解放されることの証明。throwを経由してもreleaseLockは必ず呼ばれる
    // （素朴なtry無しの直線的な実装だと、ここで呼ばれずロックが握られたままになる）
    expect(deps.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('active:falseなら中止してthrowし、プロパティを書き換えない', () => {
    const deps = makeDeps({
      callLineApi: vi.fn(() => okGetResult('https://example.com/exec?t=old-token', false)),
    });

    expect(() => runTokenRotation(deps)).toThrow(/active:false/);
    expect(deps.writeWebhookToken).not.toHaveBeenCalled();
  });

  it('endpointが未設定なら中止してthrowし、プロパティを書き換えない', () => {
    const deps = makeDeps({
      callLineApi: vi.fn(() => okGetResult('', true)),
    });

    expect(() => runTokenRotation(deps)).toThrow(/endpoint.*未設定/);
    expect(deps.writeWebhookToken).not.toHaveBeenCalled();
  });

  it('登録URLにtが無ければ中止してthrowし、プロパティを書き換えない', () => {
    const deps = makeDeps({
      callLineApi: vi.fn(() => okGetResult('https://example.com/exec', true)),
    });

    expect(() => runTokenRotation(deps)).toThrow(/含まれていない/);
    expect(deps.writeWebhookToken).not.toHaveBeenCalled();
  });

  it('3つの中止条件のメッセージは互いに区別できる', () => {
    const messageOf = (endpoint: string, active: boolean): string => {
      const deps = makeDeps({ callLineApi: vi.fn(() => okGetResult(endpoint, active)) });
      try {
        runTokenRotation(deps);
        throw new Error('should have thrown');
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };

    const messages = [
      messageOf('https://example.com/exec?t=old', false),
      messageOf('', true),
      messageOf('https://example.com/exec', true),
    ];

    expect(new Set(messages).size).toBe(3);
  });

  it('旧トークンCはプロパティの値ではなく、GETで取得した登録URLから抽出する（ADR-0004の要）', () => {
    // ADR-0004が警告する実際の事故形を再現する: 前回PUTが失敗した翌月の状態を想定し、
    // プロパティは"C,N_prev"（末尾は1つ前のローテーションで生成されたが登録されなかった
    // トークン）、登録URLは依然としてCを指す。プロパティ末尾を現行とみなす実装
    // （素朴な実装ミス）なら、ここで"N_prev,N_new"を書いてしまい、LINEが実際に使っている
    // Cが受付集合から消えて全停止する。登録URL由来の実装なら"url-token,N_new"になるはず。
    const deps = makeDeps({
      readWebhookToken: vi.fn(() => 'url-token,previous-new-token'),
      callLineApi: vi.fn((method: 'get' | 'put') => {
        if (method === 'get') {
          return okGetResult('https://example.com/exec?t=url-token');
        }
        return okPutResult();
      }),
      generateToken: vi.fn(() => 'new-token'),
    });

    runTokenRotation(deps);

    // "C,N"のCはURL側のurl-token。プロパティ末尾のprevious-new-tokenが誤って
    // Cとして使われていない（末尾由来の実装ならここは'previous-new-token,new-token'になる）
    expect(deps.writeWebhookToken).toHaveBeenNthCalledWith(1, 'url-token,new-token');
  });

  it('ロック取得に失敗したらthrowせず静かに終了し、プロパティを書き換えない', () => {
    const deps = makeDeps({
      tryLock: vi.fn(() => false),
      callLineApi: vi.fn(),
    });

    expect(() => runTokenRotation(deps)).not.toThrow();
    expect(deps.callLineApi).not.toHaveBeenCalled();
    expect(deps.writeWebhookToken).not.toHaveBeenCalled();
    expect(deps.releaseLock).not.toHaveBeenCalled();
    expect(takeLogs().join('\n')).toContain('ロック');
  });
});

describe('setupRotationTrigger', () => {
  it('冪等: 同ハンドラの既存トリガーを削除してから作成する（2回実行してもトリガーが増えない）', () => {
    const rotationTrigger = { getHandlerFunction: () => 'rotateWebhookToken' };
    const otherTrigger = { getHandlerFunction: () => 'doPost' };
    const deleteTrigger = vi.fn();
    const create = vi.fn();
    const atHour = vi.fn(() => ({ create }));
    const onMonthDay = vi.fn(() => ({ atHour }));
    const timeBased = vi.fn(() => ({ onMonthDay }));
    const newTrigger = vi.fn(() => ({ timeBased }));

    (globalThis as any).ScriptApp = {
      getProjectTriggers: () => [rotationTrigger, otherTrigger],
      deleteTrigger,
      newTrigger,
    };

    setupRotationTrigger();

    // 同ハンドラのトリガーだけ削除する。関係ないトリガー（doPost等）は消さない
    expect(deleteTrigger).toHaveBeenCalledTimes(1);
    expect(deleteTrigger).toHaveBeenCalledWith(rotationTrigger);
    expect(newTrigger).toHaveBeenCalledWith('rotateWebhookToken');
    expect(create).toHaveBeenCalledTimes(1);
  });
});
