// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@unocss/nuxt'],
  css: ['@fluffmind/design-system/src/tokens/md3.css'],
  build: {
    transpile: ['@fluffmind/editor-blocks'],
  },
  runtimeConfig: {
    public: {
      authEnabled: process.env.AUTH_DISABLED !== 'true' && Boolean(process.env.DATABASE_URL),
    },
  },
  typescript: {
    strict: true
  },
  app: {
    head: {
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
