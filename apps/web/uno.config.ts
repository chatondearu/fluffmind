import { defineConfig, presetWind3 } from 'unocss'
import { fluffmindPreset } from '@fluffmind/design-system'

// fluffmindPreset() only supplies theme.colors (the MD3 roles) — it needs a base
// preset like presetWind3 to actually provide the bg-/text-/border-/... utility
// rules that consult those theme colors.
export default defineConfig({
  presets: [presetWind3(), fluffmindPreset()]
})
