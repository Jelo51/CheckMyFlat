import type { Config } from 'tailwindcss'

/**
 * Tokens CheckMyFlat : encre + un accent vert de validation.
 * Contrastes vérifiés AA (voir docs/PLAN.md §0).
 */
export default {
  content: ['./app/**/*.{vue,js,ts}'],
  // Classes construites dynamiquement à partir d'une note (ScoreBar).
  safelist: [1, 2, 3, 4, 5].map((n) => `bg-score-${n}`),
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#111827', soft: '#374151' },
        surface: '#FAFAF7',
        muted: '#6B7280',
        line: { DEFAULT: '#E5E7EB', strong: '#D1D5DB' },
        brand: { DEFAULT: '#0E7A55', dark: '#0A5C40', tint: '#E4F1EB' },
        warn: { DEFAULT: '#8A6100', border: '#E8C98A', tint: '#FDF4E1' },
        danger: { DEFAULT: '#B91C1C', tint: '#FEF2F2' },
        score: {
          1: '#DC2626',
          2: '#F97316',
          3: '#EAB308',
          4: '#84CC16',
          5: '#16A34A',
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['"Public Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '14px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(17,24,39,.05), 0 8px 24px -12px rgba(17,24,39,.18)',
      },
      maxWidth: {
        page: '1120px',
      },
    },
  },
  plugins: [],
} satisfies Config
