const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'release/**', 'build-electron/**', 'node_modules/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}', 'electron/**/*.ts', 'shared/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error'
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname
      }
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../../../electron/**', '../../../electron/**', '../../electron/**', '../electron/**'],
              message: 'Renderer must access main-process capability via preload APIs only.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['electron/**/*.ts', 'shared/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.electron.json',
        tsconfigRootDir: __dirname
      }
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../../src/**', '../../src/**', '../src/**'],
              message: 'Main process must not import renderer code.'
            }
          ]
        }
      ]
    }
  }
);
