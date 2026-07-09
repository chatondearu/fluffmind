import { cp, mkdir, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getDb, member, roles } from '@fluffmind/db'
import { and, eq } from 'drizzle-orm'
import { isAuthEnabled, requireSession } from '../../utils/auth'
import { resolveActiveWorkspaceId, resolveWorkspaceConfig } from '../../vault/workspace'

type TargetState = 'empty' | 'only-git' | 'not-empty'

interface AdoptionSummary {
  workspaceId: string
  sourcePath: string | null
  targetPath: string
  targetState: TargetState
  adopted: boolean
  copiedTopLevelEntries: number
  copiedMarkdownFiles: number
  reason: string | null
}

function hasWorkspaceManagePermission(role: string): boolean {
  const definition = (roles as Record<string, { workspace?: string[] }>)[role]
  return Boolean(definition?.workspace?.includes('manage'))
}

function classifyTargetState(entryNames: string[]): TargetState {
  if (entryNames.length === 0)
    return 'empty'
  if (entryNames.every(name => name === '.git'))
    return 'only-git'
  return 'not-empty'
}

function isMarkdownFile(path: string): boolean {
  return /\.md$/i.test(path)
}

async function countMarkdownFiles(path: string): Promise<number> {
  const current = await stat(path)
  if (current.isFile())
    return isMarkdownFile(path) ? 1 : 0
  if (!current.isDirectory())
    return 0

  const entries = await readdir(path, { withFileTypes: true })
  let count = 0
  for (const entry of entries) {
    if (entry.name === '.git')
      continue
    const childPath = resolve(path, entry.name)
    count += await countMarkdownFiles(childPath)
  }
  return count
}

async function copyLegacyVault(sourcePath: string, targetPath: string): Promise<{ copiedTopLevelEntries: number, copiedMarkdownFiles: number }> {
  const sourceEntries = await readdir(sourcePath, { withFileTypes: true })
  const entriesToCopy = sourceEntries.filter(entry => entry.name !== '.git')

  for (const entry of entriesToCopy) {
    await cp(resolve(sourcePath, entry.name), resolve(targetPath, entry.name), {
      recursive: true,
      preserveTimestamps: true,
      force: true
    })
  }

  const copiedMarkdownFiles = await countMarkdownFiles(sourcePath)
  return {
    copiedTopLevelEntries: entriesToCopy.length,
    copiedMarkdownFiles
  }
}

export default defineEventHandler(async (event): Promise<AdoptionSummary> => {
  if (!isAuthEnabled()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Auth disabled',
      message: 'Workspace adoption is only available when authentication is enabled.'
    })
  }

  const session = await requireSession(event)
  const workspaceId = await resolveActiveWorkspaceId(event)
  const db = getDb()

  const [workspaceMember] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, session.user.id)))
    .limit(1)

  if (!workspaceMember) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'You are not a member of the selected workspace.'
    })
  }

  if (!hasWorkspaceManagePermission(workspaceMember.role) && workspaceMember.role !== 'owner') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'Workspace adoption requires owner role or workspace:manage permission.'
    })
  }

  const workspace = await resolveWorkspaceConfig(workspaceId)
  const targetPath = workspace.path
  await mkdir(targetPath, { recursive: true })

  const legacyVaultPath = process.env.VAULT_PATH?.trim() || ''
  const sourcePath = legacyVaultPath ? resolve(legacyVaultPath) : null

  const targetEntries = await readdir(targetPath, { withFileTypes: true })
  const targetState = classifyTargetState(targetEntries.map(entry => entry.name))

  if (!sourcePath) {
    return {
      workspaceId,
      sourcePath: null,
      targetPath,
      targetState,
      adopted: false,
      copiedTopLevelEntries: 0,
      copiedMarkdownFiles: 0,
      reason: 'VAULT_PATH is not set.'
    }
  }

  if (targetState === 'not-empty') {
    return {
      workspaceId,
      sourcePath,
      targetPath,
      targetState,
      adopted: false,
      copiedTopLevelEntries: 0,
      copiedMarkdownFiles: 0,
      reason: 'Target workspace vault already contains files.'
    }
  }

  if (sourcePath === targetPath) {
    return {
      workspaceId,
      sourcePath,
      targetPath,
      targetState,
      adopted: false,
      copiedTopLevelEntries: 0,
      copiedMarkdownFiles: 0,
      reason: 'Legacy VAULT_PATH already points to this workspace vault.'
    }
  }

  const sourceStats = await stat(sourcePath).catch(() => null)
  if (!sourceStats?.isDirectory()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid VAULT_PATH',
      message: 'VAULT_PATH must point to an existing directory.'
    })
  }

  const { copiedTopLevelEntries, copiedMarkdownFiles } = await copyLegacyVault(sourcePath, targetPath)

  return {
    workspaceId,
    sourcePath,
    targetPath,
    targetState,
    adopted: true,
    copiedTopLevelEntries,
    copiedMarkdownFiles,
    reason: null
  }
})
