import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

// Clean Architecture layering enforcement (see CLAUDE.md — Engineering Principles).
// Services follow domain / application / infrastructure / presentation.
// Dependencies point inwards only:
//   domain         → nothing (no other layer, no frameworks)
//   application    → domain
//   infrastructure → application, domain
//   presentation   → application, domain
// Concrete infrastructure is wired only at the composition root (src/main.ts).

const serviceFiles = (layer) => [`apps/*/src/${layer}/**/*.ts`];

const restrictLayers = (layers, message) => ({
  patterns: layers.map((layer) => ({
    group: [`**/${layer}/**`, `**/${layer}`],
    message,
  })),
});

// Frameworks and drivers must never leak into the domain layer.
const domainForbiddenModules = [
  'hono',
  'pg',
  'amqplib',
  'ioredis',
  'redis',
  'bullmq',
  'stripe',
  'twilio',
  'resend',
].map((name) => ({
  name,
  message: 'Domain must stay framework-free — wrap this behind an interface implemented in infrastructure/.',
}));

export const config = [
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', 'coverage/**'],
  },
  {
    files: ['apps/*/src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      sourceType: 'module',
    },
    // Registered so existing eslint-disable comments naming
    // @typescript-eslint/* rules resolve; no rules enabled from it here.
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
  },
  {
    files: serviceFiles('domain'),
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: domainForbiddenModules,
          ...restrictLayers(
            ['application', 'infrastructure', 'presentation'],
            'domain/ must not depend on outer layers — dependencies point inwards only.',
          ),
        },
      ],
    },
  },
  {
    files: serviceFiles('application'),
    rules: {
      'no-restricted-imports': [
        'error',
        restrictLayers(
          ['infrastructure', 'presentation'],
          'application/ may only depend on domain/ — define an interface here and implement it in infrastructure/.',
        ),
      ],
    },
  },
  {
    files: serviceFiles('infrastructure'),
    rules: {
      'no-restricted-imports': [
        'error',
        restrictLayers(
          ['presentation'],
          'infrastructure/ must not depend on presentation/.',
        ),
      ],
    },
  },
  {
    files: serviceFiles('presentation'),
    rules: {
      'no-restricted-imports': [
        'error',
        restrictLayers(
          ['infrastructure'],
          'presentation/ must not import concrete infrastructure — depend on an application/domain interface and inject the implementation from main.ts.',
        ),
      ],
    },
  },
  // ── Legacy debt — pre-existing violations grandfathered in. ──────────────
  // This list may only SHRINK. Never add a file here; fix the layering
  // instead (Boy Scout Rule). Each entry is a known violation to refactor.
  {
    files: [
      // admin presentation imports ServiceClient/R2UploadClient directly.
      'apps/admin/src/presentation/**/*.ts',
      // use-cases importing concrete infrastructure instead of an interface.
      'apps/admin/src/application/submit-valuation-enquiry.use-case.ts',
      'apps/user-auth/src/application/upload-identity-document.use-case.ts',
      // event handlers import email templates from infrastructure directly.
      'apps/notification-service/src/application/handlers/*.handler.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];

export default config;
