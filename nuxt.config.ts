// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },

  modules: ['@nuxtjs/supabase', '@nuxtjs/tailwindcss', '@nuxt/eslint'],

  typescript: {
    strict: true,
    typeCheck: false,
  },

  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      title: 'CheckMyFlat',
      titleTemplate: '%s · CheckMyFlat',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Vous ne pouvez pas visiter ? Un visiteur CheckMyFlat y va pour vous, note 14 critères et vous remet un rapport sous 24 h.',
        },
        { name: 'theme-color', content: '#111827' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },

  supabase: {
    // Les redirections sont gérées par le middleware global `auth` (rôles).
    redirect: false,
    types: '~/types/database.types.ts',
  },

  tailwindcss: {
    // Le chemin par défaut du module ne suit pas le srcDir `app/` de Nuxt 4.
    cssPath: '~/assets/css/tailwind.css',
  },

  runtimeConfig: {
    stripeSecretKey: '',
    stripeWebhookSecret: '',
    /** Hôte de l'API Stripe (surchargé en test par stripe-mock). */
    stripeApiHost: '',
    stripeApiPort: '',
    stripeApiProtocol: '',
    resendApiKey: '',
    emailFrom: '',
    /** `resend` en production, `log` en local et en test. */
    emailProvider: 'log',
    /** Secret partagé des tâches planifiées déclenchées par un cron externe. */
    cronSecret: '',
    public: {
      siteUrl: 'http://localhost:3000',
      stripePublishableKey: '',
    },
  },

  nitro: {
    preset: 'node-server',
    experimental: { tasks: true },
    scheduledTasks: {
      '*/15 * * * *': ['payments:maintenance'],
    },
    serverAssets: [{ baseName: 'fonts', dir: './assets/fonts' }],
  },

  eslint: {
    config: { stylistic: false },
  },
})
