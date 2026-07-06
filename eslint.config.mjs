// Root ESLint config for the plain-TypeScript packages (packages/*).
// apps/web has its own eslint.config.mjs, generated via the official @nuxt/eslint module.
// @ts-check
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.nuxt/**', '**/.output/**', 'apps/**']
  },
  ...tseslint.configs.recommended,
  {
    files: ['packages/**/*.ts'],
    rules: {}
  }
)
