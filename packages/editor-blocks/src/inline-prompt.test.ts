import { describe, expect, it, vi } from 'vitest'

import { createInlinePromptController } from './inline-prompt'

describe('createInlinePromptController', () => {
  it('emits on request and resolves on confirm', async () => {
    const onRequest = vi.fn()
    const ctrl = createInlinePromptController(onRequest)
    const pending = ctrl.request('link')
    expect(onRequest).toHaveBeenCalledWith('link')
    ctrl.confirm('https://example.com')
    await expect(pending).resolves.toBe('https://example.com')
  })

  it('cancels previous pending with null when a new request starts', async () => {
    const ctrl = createInlinePromptController(() => {})
    const first = ctrl.request('link')
    const second = ctrl.request('wikilink')
    await expect(first).resolves.toBeNull()
    ctrl.confirm('note-a')
    await expect(second).resolves.toBe('note-a')
  })

  it('dispose resolves pending with null', async () => {
    const ctrl = createInlinePromptController(() => {})
    const pending = ctrl.request('link')
    ctrl.dispose()
    await expect(pending).resolves.toBeNull()
  })

  it('confirm is a no-op when nothing is pending', () => {
    const ctrl = createInlinePromptController(() => {})
    expect(() => ctrl.confirm('x')).not.toThrow()
  })
})
