// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // Skip anonymous telemetry consent prompt (blocks non-interactive builds).
  telemetry: false,
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@unocss/nuxt'],
  css: [
    '@fluffmind/design-system/src/tokens/md3.css',
    '~/assets/css/app.css',
  ],
  build: {
    transpile: ['@fluffmind/editor-blocks', '@fluffmind/kanban', 'mermaid'],
  },
  runtimeConfig: {
    public: {
      authEnabled: process.env.AUTH_DISABLED !== 'true' && Boolean(process.env.DATABASE_URL),
      githubOAuthEnabled: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    },
  },
  typescript: {
    strict: true
  },
  app: {
    head: {
      link: [
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,100..1000&display=swap',
        },
      ],
      script: [
        {
          // Applies a stored theme preference before Vue mounts, to avoid a flash of
          // the wrong theme. Kept out of useTheme.ts on purpose: this has to run
          // synchronously in <head>, before the app's own JS loads.
          innerHTML:
            "try{var t=localStorage.getItem('fluffmind-theme');if(t&&t!=='system')document.documentElement.setAttribute('data-theme',t)}catch(e){}",
          type: 'text/javascript'
        }
      ]
    }
  }
})
