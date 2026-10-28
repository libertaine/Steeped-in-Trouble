import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['dist/', 'coverage/', 'playwright-report/', 'test-results/', 'docs/reference/', 'tmp/'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' },
    },
  },
  {
    files: ['*.config.js', 'tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
];
