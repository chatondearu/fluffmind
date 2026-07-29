import { describe, expect, it } from 'vitest'

import {
  parseAdminUsersLimit,
  wouldRemoveLastAdmin,
} from './admin-guards'

describe('admin-guards', () => {
  it('caps admin users list limit', () => {
    expect(parseAdminUsersLimit(undefined)).toBe(50)
    expect(parseAdminUsersLimit('10')).toBe(10)
    expect(parseAdminUsersLimit('0')).toBe(50)
    expect(parseAdminUsersLimit('1000000')).toBe(200)
    expect(parseAdminUsersLimit('-5')).toBe(50)
  })

  it('blocks removing the last admin', () => {
    expect(wouldRemoveLastAdmin({ targetIsAdmin: true, adminCount: 1 })).toBe(true)
    expect(wouldRemoveLastAdmin({ targetIsAdmin: true, adminCount: 0 })).toBe(true)
  })

  it('allows removing an admin when another admin remains', () => {
    expect(wouldRemoveLastAdmin({ targetIsAdmin: true, adminCount: 2 })).toBe(false)
  })

  it('never blocks non-admin targets', () => {
    expect(wouldRemoveLastAdmin({ targetIsAdmin: false, adminCount: 1 })).toBe(false)
  })
})
