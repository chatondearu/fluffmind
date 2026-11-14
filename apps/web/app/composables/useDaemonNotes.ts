import { $fetch } from 'ofetch'

import {
  daemonClientBase,
  daemonHealthUrl,
  daemonNoteGetUrl,
  daemonNotesUrl,
  normalizeDaemonBaseUrl,
  shouldPreferDaemon,
} from '../utils/daemon-notes'

export interface DaemonNoteWriteResult {
  id: string
  path: string
  contentHash: string
  created: boolean
  committed: boolean
  pushed: boolean
}

export interface DaemonNoteReadResult {
  id: string
  content: string
  path: string
}

export interface DaemonHealthResult {
  ok: boolean
  vaultPath?: string
  defaultWriter?: string
  syncMode?: string
}

/**
 * Thin HTTP client for fluffmind-daemon (`PUT|GET /v1/notes`, `GET /health`).
 * Active when AUTH_DISABLED (authEnabled=false) and NUXT_PUBLIC_DAEMON_URL is set.
 * Browser calls go through Nitro `/__daemon` (no CORS, not the Git vault API).
 */
export function useDaemonNotes() {
  const config = useRuntimeConfig()

  const configuredUrl = computed(() =>
    normalizeDaemonBaseUrl(String(config.public.daemonUrl ?? '')),
  )

  const preferDaemon = computed(() =>
    shouldPreferDaemon({
      authEnabled: Boolean(config.public.authEnabled),
      daemonUrl: configuredUrl.value,
    }),
  )

  /** Request base used by the browser (proxy), not the absolute daemon listen URL. */
  const requestBase = computed(() =>
    preferDaemon.value ? daemonClientBase(configuredUrl.value) : '',
  )

  async function health(): Promise<DaemonHealthResult> {
    return await $fetch<DaemonHealthResult>(daemonHealthUrl(requestBase.value))
  }

  async function getNote(id: string, writer?: string): Promise<DaemonNoteReadResult> {
    return await $fetch<DaemonNoteReadResult>(
      daemonNoteGetUrl(requestBase.value, id, writer),
    )
  }

  async function putNote(
    id: string,
    content: string,
    writer?: string,
  ): Promise<DaemonNoteWriteResult> {
    return await $fetch<DaemonNoteWriteResult>(daemonNotesUrl(requestBase.value), {
      method: 'PUT',
      body: {
        id,
        content,
        ...(writer?.trim() ? { writer: writer.trim() } : {}),
      },
    })
  }

  return {
    daemonUrl: configuredUrl,
    preferDaemon,
    /** Alias used by autosave / boards. */
    enabled: preferDaemon,
    health,
    getNote,
    putNote,
  }
}
