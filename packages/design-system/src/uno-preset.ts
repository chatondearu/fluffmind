import { definePreset } from 'unocss'
import { MD3_ROLE_KEYS } from './tokens/md3.ts'
import { cssVarName } from './tokens/css.ts'

function colorMixVar(role: (typeof MD3_ROLE_KEYS)[number]): string {
  return `color-mix(in srgb, var(${cssVarName(role)}) calc(%alpha * 100%), transparent)`
}

export const fluffmindPreset = definePreset(() => ({
  name: '@fluffmind/design-system',
  theme: {
    colors: Object.fromEntries(MD3_ROLE_KEYS.map(role => [role, colorMixVar(role)])),
    fontFamily: {
      sans: '"Roboto Flex", "Segoe UI", system-ui, sans-serif',
    },
    boxShadow: {
      'md3-1': '0 1px 2px color-mix(in srgb, var(--md-shadow) 30%, transparent), 0 1px 3px 1px color-mix(in srgb, var(--md-shadow) 15%, transparent)',
      'md3-2': '0 1px 2px color-mix(in srgb, var(--md-shadow) 30%, transparent), 0 2px 6px 2px color-mix(in srgb, var(--md-shadow) 15%, transparent)',
    },
  },
  shortcuts: {
    'md3-display-sm': 'text-2xl font-normal leading-tight tracking-tight text-on-surface font-sans',
    'md3-headline-sm': 'text-xl font-normal leading-snug text-on-surface font-sans',
    'md3-title-md': 'text-base font-medium leading-normal text-on-surface font-sans',
    'md3-title-sm': 'text-sm font-medium leading-normal text-on-surface font-sans',
    'md3-body-lg': 'text-base leading-relaxed text-on-surface font-sans',
    'md3-body-md': 'text-sm leading-relaxed text-on-surface font-sans',
    'md3-label-lg': 'text-sm font-medium leading-normal text-on-surface-variant font-sans',
    'md3-label-md': 'text-xs font-medium leading-normal tracking-wide text-on-surface-variant font-sans',
    'md3-field': 'w-full rounded-xl border border-outline bg-surface-container-low px-4 py-2.5 md3-body-md text-on-surface outline-none transition placeholder:text-on-surface-variant focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15',
    'md3-card': 'rounded-2xl border border-outline-variant bg-surface-container-low shadow-md3-1',
    'md3-card-outlined': 'rounded-2xl border border-outline-variant bg-surface',
    // text-left overrides the UA button default (text-align: center) so folder/
    // file labels stay left-aligned when ListItem renders as <button>.
    'md3-nav-item': 'flex min-w-0 items-center gap-2 rounded-full px-3 py-2 text-left md3-body-md text-on-surface transition-colors hover:bg-on-surface/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
    'md3-nav-item-active': 'bg-secondary-container text-on-secondary-container font-medium hover:bg-secondary-container',
    'md3-menu': 'overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-low shadow-md3-2',
    'md3-state-layer': 'relative overflow-hidden before:absolute before:inset-0 before:bg-on-surface before:opacity-0 before:transition-opacity hover:before:opacity-8',
    'md3-top-bar': 'sticky top-0 z-10 flex min-h-16 items-center gap-2 border-b border-outline-variant bg-surface-container px-4 shadow-md3-1 backdrop-blur-sm',
    'md3-page': 'w-full max-w-4xl px-6 py-6 md:px-8 md:py-8',
    'md3-sidebar': 'flex h-full min-h-0 w-72 shrink-0 flex-col border-r border-outline-variant bg-surface-container-low',
  },
}))
