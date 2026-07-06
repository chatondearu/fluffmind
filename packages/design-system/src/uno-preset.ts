import { definePreset } from 'unocss'
import { MD3_ROLE_KEYS } from './tokens/md3.ts'
import { cssVarName } from './tokens/css.ts'

/**
 * Makes opacity utilities (`bg-primary/50`, `text-on-surface/10`, ...) work against MD3
 * CSS custom properties.
 *
 * UnoCSS's built-in color parser only understands literal color syntax (hex, rgb(),
 * hsl(), ...) — a bare `var(--md-primary)` theme color is opaque to it, so `/50`
 * modifiers are silently dropped (verified empirically while building this preset).
 * The fix: use Uno's `%alpha` placeholder inside a `color-mix()` template. Uno
 * substitutes `%alpha` with the resolved opacity as a 0-1 fraction, so it has to be
 * turned into a percentage via `calc(%alpha * 100%)` — `color-mix()` requires a
 * `<percentage>`, and a bare fraction like `0.5` is invalid there.
 *
 * This composes correctly with light/dark theme switching: `var(--md-xxx)` resolves
 * against whichever `:root` / `:root[data-theme]` block is active, and color-mix()
 * just operates on top of that at paint time.
 */
function colorMixVar(role: (typeof MD3_ROLE_KEYS)[number]): string {
  return `color-mix(in srgb, var(${cssVarName(role)}) calc(%alpha * 100%), transparent)`
}

export const fluffmindPreset = definePreset(() => ({
  name: '@fluffmind/design-system',
  theme: {
    colors: Object.fromEntries(MD3_ROLE_KEYS.map((role) => [role, colorMixVar(role)]))
  }
}))
