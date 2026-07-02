import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * 확장 페이지(popup/dashboard)와 background service worker 빌드 설정.
 * content script는 IIFE 번들이 필요하므로 vite.content.config.ts에서 별도 빌드한다.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        // service worker는 manifest가 고정 경로로 참조하므로 해시 없이 출력한다.
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
