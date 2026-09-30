const eslint = require('@eslint/js')
const globals = require('globals')
const prettier = require('eslint-config-prettier')
const tseslint = require('typescript-eslint')

module.exports = tseslint.config(
  {
    ignores: ['coverage', 'server/out'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['server/src/**/*.ts', 'testing/**/*.ts', 'vitest.config.mts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Keep imported upstream source compatible with its oxlint rule set.
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    files: ['server/src/util/sh.ts'],
    rules: {
      // Match upstream's explicit oxlint suppression for its generic cache helper.
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
  {
    files: ['eslint.config.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettier,
)
