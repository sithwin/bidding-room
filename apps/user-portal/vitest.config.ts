import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { coverage } from '../../vitest.shared';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], globals: true, coverage },
  resolve: { alias: { '@': resolve(__dirname, './src') } },
});
