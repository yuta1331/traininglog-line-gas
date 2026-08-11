// GASのグローバルはNode上に存在しないため、テスト実行前にスタブを置く。
//
// ここに足すのは「テスト対象のmoduleが直接触るGASグローバル」だけにする。
// スタブが増えてきたら、それはmoduleがGASに寄りすぎているサイン（#35）。

import { beforeEach } from 'vitest';

const logs: string[] = [];

(globalThis as any).Logger = {
  log(message: unknown): void {
    logs.push(String(message));
  },
};

// テスト間でログが混ざらないようにする
beforeEach(() => {
  logs.length = 0;
});

/** テスト内でログ出力を検証したい場合に使う */
export function takeLogs(): string[] {
  return logs.splice(0, logs.length);
}
