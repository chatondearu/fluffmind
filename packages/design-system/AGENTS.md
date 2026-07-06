# Agent instructions — packages/design-system

See the root `AGENTS.md` and `DESIGN.md` first. This file covers this package
specifically.

## Two entry points, on purpose — do not merge them

- `src/index.ts` — Node-safe only (tokens, Uno preset). Loaded by consuming apps'
  `uno.config.ts` via `unconfig`/`jiti`, which runs in a plain Node context that
  **cannot parse `.vue` files**.
- `src/components.ts` — the Vue component exports (`FluffmindButton`,
  `FluffmindTooltip`, ...).

Re-exporting a `.vue` component from `index.ts` breaks `nuxt build` in any consumer
(jiti tries to load the whole barrel and fails on the `.vue` import) — verified by
reproducing and fixing exactly this. If you add a new Vue component, export it from
`components.ts`, never from `index.ts`.

## MD3 tokens (`src/tokens/`)

- `md3.ts` — `generateMd3Tokens(seedColor)` wraps
  `@material/material-color-utilities`' `themeFromSourceColor`. `cssVarName(role)`
  converts a camelCase role (`onPrimaryContainer`) to its CSS custom property name
  (`--md-on-primary-container`).
- `css.ts` — renders the token set as `:root` / `:root[data-theme="dark"]` /
  `prefers-color-scheme` blocks. The checked-in `md3.css` is generated output — after
  changing the seed color, regenerate it with `pnpm generate:css`, don't hand-edit it.

## Uno preset (`src/uno-preset.ts`)

Color values are
`color-mix(in srgb, var(--md-<role>) calc(%alpha * 100%), transparent)` —
**not** a bare `var(--md-<role>)`. Verified empirically: with a bare CSS-var color,
UnoCSS's built-in color parser doesn't recognize it as parseable, so `/50`-style
opacity modifiers are silently dropped (`bg-primary/50` produced plain
`background-color:var(--md-primary)`, no alpha at all). Uno's `%alpha` placeholder
fixes the substitution, but it resolves to a 0–1 fraction, and `color-mix()` requires
a `<percentage>` — hence the `calc(%alpha * 100%)` wrapper. If you touch this file,
re-verify with an actual build (`nuxt build` + grep the output CSS for
`color-mix`), not just a read-through — this exact bug looked fine on paper.

`fluffmindPreset()` only supplies `theme.colors` — it has no `bg-`/`text-`/`border-`
rules of its own. Consuming apps must combine it with a base preset (e.g.
`presetWind3()`) in their `uno.config.ts`, or nothing generates at all (verified: even
unrelated built-in classes like `bg-red-500` produced no CSS without a base preset).

## Running scripts standalone

`generate:css` and any other script in `scripts/` run via
`node --experimental-strip-types`, not a bundler — imports between files in this
package use **explicit `.ts` extensions** (`./md3.ts`), unlike `apps/web` (see root
`AGENTS.md` for why this differs by context).
