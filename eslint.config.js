//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  // Tooling + scripts live in tsconfig.node.json (not the app tsconfig).
  {
    files: [
      'vite.config.ts',
      'vitest.config.ts',
      'drizzle.config.ts',
      'eslint.config.js',
      'prettier.config.js',
      'scripts/**/*.{ts,tsx,js,mjs,cjs}',
      'worker-env.d.ts',
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      '.output/**',
      'dist/**',
      'node_modules/**',
      'drizzle/**',
      'coverage/**',
      '.wrangler/**',
      'e2e/**',
      'playwright.config.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
]
