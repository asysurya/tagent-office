/**
 * Path: /eslint.config.js (root)
 * Purpose: Flat ESLint config for the whole monorepo. TypeScript strict rules
 *          for packages, React Hooks rules for apps/web. Zero-warning policy:
 *          every enabled rule is "error".
 * Dependencies: @eslint/js, typescript-eslint, eslint-plugin-react-hooks
 */
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      'apps/web/next-env.d.ts',
      '**/next-env.d.ts',
      'storage/**',
      'skills/**',
      'download/**',
      'scripts/sandbox/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
);
