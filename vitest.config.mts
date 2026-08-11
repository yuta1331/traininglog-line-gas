import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // GASのグローバル（Loggerなど）をNode上のテストで使えるようにする
    setupFiles: ['./test/setup.ts'],
  },
});
