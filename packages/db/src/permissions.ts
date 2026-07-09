import { createAccessControl } from 'better-auth/plugins/access'

export const statements = {
  note: ['read', 'write'],
  workspace: ['manage'],
} as const

export const ac = createAccessControl(statements)

export const read = ac.newRole({ note: ['read'] })
export const write = ac.newRole({ note: ['read', 'write'] })
export const owner = ac.newRole({ note: ['read', 'write'], workspace: ['manage'] })

export const roles = { read, write, owner }
