import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface FluffmindConfig {
  url: string
  token: string
}

/** `~/.config/fluffmind/config.json` — the lowest-precedence config source. */
export function getConfigPath(): string {
  return join(homedir(), '.config', 'fluffmind', 'config.json')
}

function readConfigFile(): Partial<FluffmindConfig> {
  let raw: string
  try {
    raw = readFileSync(getConfigPath(), 'utf-8')
  }
  catch {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof FluffmindConfig, unknown>>
    return {
      url: typeof parsed.url === 'string' ? parsed.url : undefined,
      token: typeof parsed.token === 'string' ? parsed.token : undefined,
    }
  }
  catch {
    return {}
  }
}

/**
 * Resolves `{ url, token }` with precedence: CLI flags > `FLUFFMIND_URL`/
 * `FLUFFMIND_TOKEN` env vars > `~/.config/fluffmind/config.json`. Missing values
 * resolve to `''` — callers decide whether that's an error (see CLI exit code 2).
 */
export function loadConfig(env: NodeJS.ProcessEnv, flags: Partial<FluffmindConfig> = {}): FluffmindConfig {
  const fileConfig = readConfigFile()
  return {
    url: flags.url || env.FLUFFMIND_URL || fileConfig.url || '',
    token: flags.token || env.FLUFFMIND_TOKEN || fileConfig.token || '',
  }
}
