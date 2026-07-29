import { describe, expect, it } from 'vitest'

import { roles } from './permissions.ts'

describe('organization access control', () => {
  it('lets owners create and cancel invitations', () => {
    expect(roles.owner.authorize({ invitation: ['create'] })).toEqual({ success: true })
    expect(roles.owner.authorize({ invitation: ['cancel'] })).toEqual({ success: true })
  })

  it('keeps workspace:manage on owners only', () => {
    expect(roles.owner.authorize({ workspace: ['manage'] })).toEqual({ success: true })
    expect(roles.write.authorize({ workspace: ['manage'] }).success).toBe(false)
    expect(roles.read.authorize({ workspace: ['manage'] }).success).toBe(false)
  })

  it('does not let read/write members invite', () => {
    expect(roles.write.authorize({ invitation: ['create'] }).success).toBe(false)
    expect(roles.read.authorize({ invitation: ['create'] }).success).toBe(false)
  })
})
