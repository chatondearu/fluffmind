import { getVaultIndex } from '../vault/service'
import { getGraph } from '../vault/index'

export default defineEventHandler(async () => {
  const index = await getVaultIndex()
  return getGraph(index)
})
