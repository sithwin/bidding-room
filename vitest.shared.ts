export const coverage = {
  provider: 'v8' as const,
  reporter: ['lcov', 'text'] as ('lcov' | 'text')[],
  exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.config.ts', '**/dist/**', '**/node_modules/**'],
};
