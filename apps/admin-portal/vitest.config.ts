import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { coverage } from '../../vitest.shared';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    coverage,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
