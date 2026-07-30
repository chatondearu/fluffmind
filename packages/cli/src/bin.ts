#!/usr/bin/env -S node --experimental-strip-types
import { main } from './cli.ts'

main(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = exitCode
}).catch((error: unknown) => {
  console.error(`fluffmind: unexpected error: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 3
})
