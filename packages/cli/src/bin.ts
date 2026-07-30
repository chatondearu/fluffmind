#!/usr/bin/env -S node --experimental-strip-types
import { main } from './cli.ts'

main(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = exitCode
})
