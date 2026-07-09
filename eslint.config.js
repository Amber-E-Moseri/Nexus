// BLW-13: hooks-correctness linting. Scoped to the React hooks rules —
// rules-of-hooks violations are errors; exhaustive-deps (recreated or missing
// effect dependencies) are warnings to burn down over time.
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.claude/**', 'supabase/**', 'public/**'],
  },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Existing code carries eslint-disable comments for this rule; keep it
      // defined so those directives resolve, and flag new raw-HTML sinks.
      'react/no-danger': 'warn',
    },
  },
]
