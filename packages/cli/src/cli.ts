import { parseArgs } from 'node:util'
import { CliUsageError, isCommandName, runCommand } from './commands.ts'
import { FluffmindClient, FluffmindHttpError } from './client.ts'
import { loadConfig } from './config.ts'

const EXIT_OK = 0
const EXIT_BUSINESS = 1
const EXIT_CONFIG = 2
const EXIT_NETWORK = 3

const USAGE = 'usage: fluffmind <whoami|search|read|write|backlinks|graph|task|config> [args] '
  + '[--url URL] [--token TOKEN] [--pretty] [--file PATH] [--stdin] [--limit N] [--note ID]'

const PARSE_OPTIONS = {
  url: { type: 'string' },
  token: { type: 'string' },
  pretty: { type: 'boolean', default: false },
  file: { type: 'string' },
  stdin: { type: 'boolean', default: false },
  limit: { type: 'string' },
  note: { type: 'string' },
} as const

function parseCliArgs(argv: string[]) {
  return parseArgs({ args: argv, allowPositionals: true, options: PARSE_OPTIONS })
}

/** Entry point for the `fluffmind` CLI. Returns the process exit code (never throws). */
export async function main(argv: string[]): Promise<number> {
  let parsed: ReturnType<typeof parseCliArgs>
  try {
    parsed = parseCliArgs(argv)
  }
  catch (error) {
    return fail(EXIT_CONFIG, error instanceof Error ? error.message : String(error))
  }

  const [commandArg, ...rest] = parsed.positionals
  if (!commandArg)
    return fail(EXIT_CONFIG, `missing command\n${USAGE}`)
  if (!isCommandName(commandArg))
    return fail(EXIT_CONFIG, `unknown command: ${commandArg}\n${USAGE}`)

  const config = loadConfig(process.env, { url: parsed.values.url, token: parsed.values.token })
  const pretty = Boolean(parsed.values.pretty)

  if (commandArg === 'config') {
    print({ url: config.url, token: config.token ? '<redacted>' : '' }, pretty)
    return EXIT_OK
  }

  if (!config.url || !config.token)
    return fail(EXIT_CONFIG, 'missing url/token — set --url/--token, FLUFFMIND_URL/FLUFFMIND_TOKEN, or ~/.config/fluffmind/config.json')

  const client = new FluffmindClient(config)

  try {
    const result = await runCommand(commandArg, rest, client, {
      file: parsed.values.file,
      stdin: parsed.values.stdin,
      limit: parsed.values.limit,
      note: parsed.values.note,
    })
    print(result, pretty)
    return EXIT_OK
  }
  catch (error) {
    return handleError(error)
  }
}

function print(value: unknown, pretty: boolean): void {
  console.log(JSON.stringify(value, null, pretty ? 2 : 0))
}

function fail(exitCode: number, message: string): number {
  console.error(`fluffmind: ${message}`)
  return exitCode
}

/** Maps errors to exit codes: 401/403 → config/auth (2), other 4xx → business (1), else network/5xx (3). */
function handleError(error: unknown): number {
  if (error instanceof FluffmindHttpError) {
    const exitCode = error.statusCode === 401 || error.statusCode === 403
      ? EXIT_CONFIG
      : error.statusCode >= 400 && error.statusCode < 500
        ? EXIT_BUSINESS
        : EXIT_NETWORK
    return fail(exitCode, error.message)
  }
  if (error instanceof CliUsageError)
    return fail(EXIT_CONFIG, error.message)
  return fail(EXIT_NETWORK, error instanceof Error ? error.message : String(error))
}
