/**
 * In-process vault invalidate fan-out (PRD-042 T5 / ADR-019).
 * WebSocket peers and unit tests subscribe here; writers publish after apply.
 */

import { broadcastVaultWs } from './vault-ws-peers'

export type VaultInvalidateReason = 'note-write' | 'note-publish' | 'index'

export interface VaultInvalidateEvent {
  type: 'vault-invalidate'
  workspaceId: string
  reason: VaultInvalidateReason
  /** Affected note id when known. */
  noteId?: string
  at: string
}

export type VaultInvalidateListener = (event: VaultInvalidateEvent) => void

const listenersByWorkspace = new Map<string, Set<VaultInvalidateListener>>()

export function subscribeVaultInvalidate(
  workspaceId: string,
  listener: VaultInvalidateListener,
): () => void {
  let set = listenersByWorkspace.get(workspaceId)
  if (!set) {
    set = new Set()
    listenersByWorkspace.set(workspaceId, set)
  }
  set.add(listener)
  return () => {
    set!.delete(listener)
    if (set!.size === 0)
      listenersByWorkspace.delete(workspaceId)
  }
}

export function publishVaultInvalidate(
  workspaceId: string,
  partial: Omit<VaultInvalidateEvent, 'type' | 'workspaceId' | 'at'> & { at?: string },
): VaultInvalidateEvent {
  const event: VaultInvalidateEvent = {
    type: 'vault-invalidate',
    workspaceId,
    reason: partial.reason,
    noteId: partial.noteId,
    at: partial.at ?? new Date().toISOString(),
  }
  const set = listenersByWorkspace.get(workspaceId)
  if (set) {
    for (const listener of set)
      listener(event)
  }
  broadcastVaultWs(workspaceId, JSON.stringify(event))
  return event
}

/** Test helper — clear all subscribers. */
export function clearVaultInvalidateSubscribers(): void {
  listenersByWorkspace.clear()
}
