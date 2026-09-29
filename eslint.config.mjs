// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import prettier from 'eslint-config-prettier'

export default withNuxt(
  {
    ignores: ['docs/**', 'supabase/**', 'app/types/database.types.ts'],
  },
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    // La clé service role ne doit jamais atteindre le navigateur.
    files: ['app/**/*.{ts,vue}', 'shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/server/**', '#server/**'], message: 'Code serveur interdit côté client.' },
          ],
          paths: [{ name: 'stripe', message: 'Stripe (secret) est réservé au serveur.' }],
        },
      ],
    },
  },
  prettier,
)
