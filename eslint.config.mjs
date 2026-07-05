// @ts-check

import pluginJs from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  pluginJs.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  globalIgnores(['**/dist/**', '**/node_modules/**']),
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.mjs'],
        },
      },
    },
  },
  {
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  eslintConfigPrettier,
);
