import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    server: {
      deps: {
        inline: ['@mentra/sdk'],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@mentra/sdk': path.resolve(__dirname, './__mocks__/@mentra/sdk.ts'),
    },
  },
});
