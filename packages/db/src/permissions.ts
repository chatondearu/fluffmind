import { createAccessControl } from 'better-auth/plugins/access'
import {
  defaultStatements,
  memberAc,
  ownerAc,
} from 'better-auth/plugins/organization/access'

/**
 * Merge Better Auth organization defaults with Fluffmind resources.
 * Without `invitation: ["create"]` on owner, `createInvitation` always returns
 * YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION.
 */
export const statements = {
  ...defaultStatements,
  note: ['read', 'write'],
  workspace: ['manage'],
} as const

export const ac = createAccessControl(statements)

export const read = ac.newRole({
  note: ['read'],
  ...memberAc.statements,
})

export const write = ac.newRole({
  note: ['read', 'write'],
  ...memberAc.statements,
})

export const owner = ac.newRole({
  note: ['read', 'write'],
  workspace: ['manage'],
  ...ownerAc.statements,
})

export const roles = { read, write, owner }
