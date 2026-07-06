import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { generateMd3Tokens } from '../src/tokens/md3.ts'
import { renderMd3CssVariables } from '../src/tokens/css.ts'

const outPath = fileURLToPath(new URL('../src/tokens/md3.css', import.meta.url))
const tokens = generateMd3Tokens()
writeFileSync(outPath, renderMd3CssVariables(tokens), 'utf-8')
console.log(`Wrote ${outPath}`)
