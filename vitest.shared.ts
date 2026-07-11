export const coverage = {
  provider: 'v8' as const,
  reporter: ['lcov', 'text'] as const,
  exclude: ['**/*.test.ts', '**/*.config.ts', '**/dist/**', '**/node_modules/**'],
};
