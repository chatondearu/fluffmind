import { getVaultIndex } from '../../vault/service'

export default defineEventHandler(async () => {
  const index = await getVaultIndex()
  const notes = [...index.notes.values()].sort((a, b) => a.title.localeCompare(b.title))
  return { notes }
})
