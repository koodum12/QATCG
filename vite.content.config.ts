import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * content script 전용 빌드. Chrome content script는 ES module을 지원하지 않으므로
 * IIFE 단일 파일로 번들링한다. 메인 빌드(dist)를 지우지 않도록 emptyOutDir: false.
 */
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'AiQaContent',
      fileName: () => 'content.js',
    },
  },
});
