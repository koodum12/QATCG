import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    // DOM 파싱 테스트는 파일 상단의 `// @vitest-environment jsdom` 주석으로 전환한다.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
