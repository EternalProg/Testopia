import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig as defineVitestConfig } from 'vitest/config';

export function getApiProxyTarget(mode: string, cwd: string): string {
  const env = loadEnv(mode, cwd, '');
  return env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';
}

export default defineVitestConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: getApiProxyTarget(mode, process.cwd()),
        changeOrigin: true,
      },
    },
  },
  test: {
    coverage: {
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 60,
        statements: 80,
      },
    },
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
}));
