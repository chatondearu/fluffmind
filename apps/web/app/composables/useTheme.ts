export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'fluffmind-theme'

function applyTheme(pref: ThemePreference) {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
}

/**
 * SSR-safe light/dark/system theme toggle. The actual data-theme attribute is only
 * ever touched client-side (SSR always renders the "system" default, matching
 * @media (prefers-color-scheme) — see md3.css). A tiny inline head script (see
 * nuxt.config.ts) applies the stored preference before Vue mounts, to avoid a flash
 * of the wrong theme.
 */
export function useTheme() {
  const preference = useState<ThemePreference>('theme-preference', () => 'system')

  function setPreference(pref: ThemePreference) {
    preference.value = pref
    if (import.meta.client) {
      applyTheme(pref)
      localStorage.setItem(STORAGE_KEY, pref)
    }
  }

  onMounted(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null
    if (stored) preference.value = stored
  })

  return { preference, setPreference }
}
