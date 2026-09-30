// ESLint flat config. ESLint 10 tracks JSX references itself, so no React
// plugin is needed for no-unused-vars; react-hooks enforces the hook rules.
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // `_`-prefixed names and rest siblings are deliberately unused.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true, caughtErrors: 'none' }],
    },
  },
  {
    files: ['src/**/*.test.{js,jsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['*.config.js'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
]
