import { argbFromHex, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities'

// Placeholder seed color for P0 — per-user/per-workspace customization stays a future
// extension (see PRD), not a P0 requirement. The rest of the pipeline (CSS variables,
// Uno color-mix rule) is fully agnostic to this value.
export const DEFAULT_SEED_COLOR = '#6750A4'

export const MD3_SURFACE_CONTAINER_KEYS = [
  'surfaceContainerLowest',
  'surfaceContainerLow',
  'surfaceContainer',
  'surfaceContainerHigh',
  'surfaceContainerHighest',
] as const

export const MD3_ROLE_KEYS = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'error',
  'onError',
  'errorContainer',
  'onErrorContainer',
  'background',
  'onBackground',
  'surface',
  'onSurface',
  'surfaceVariant',
  'onSurfaceVariant',
  'outline',
  'outlineVariant',
  'shadow',
  'scrim',
  'inverseSurface',
  'inverseOnSurface',
  'inversePrimary',
  ...MD3_SURFACE_CONTAINER_KEYS,
] as const

export type Md3Role = (typeof MD3_ROLE_KEYS)[number]
export type Md3Tokens = Record<Md3Role, string>

export interface Md3TokenSet {
  light: Md3Tokens
  dark: Md3Tokens
}

function schemeToHexTokens(scheme: Record<string, number>): Md3Tokens {
  const tokens = {} as Md3Tokens
  for (const role of MD3_ROLE_KEYS) {
    if (role in scheme) {
      tokens[role] = hexFromArgb(scheme[role] as number)
    }
  }
  return withSurfaceContainers(tokens)
}

/** Tone-based surface containers (M3) — derived when not in scheme v0.3. */
function withSurfaceContainers(tokens: Partial<Md3Tokens>): Md3Tokens {
  const base = tokens as Md3Tokens
  return {
    ...base,
    surfaceContainerLowest: base.background ?? base.surface,
    surfaceContainerLow: base.surfaceVariant ?? base.surface,
    surfaceContainer: base.surface,
    surfaceContainerHigh: base.surface,
    surfaceContainerHighest: base.surfaceVariant ?? base.surface,
  }
}

/**
 * Generates the full MD3 tonal palette (light + dark role sets) from a seed color.
 */
export function generateMd3Tokens(seedColor: string = DEFAULT_SEED_COLOR): Md3TokenSet {
  const theme = themeFromSourceColor(argbFromHex(seedColor))
  return {
    light: schemeToHexTokens(theme.schemes.light.toJSON()),
    dark: schemeToHexTokens(theme.schemes.dark.toJSON())
  }
}
