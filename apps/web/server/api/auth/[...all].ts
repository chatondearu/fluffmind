import { getAuth } from '@fluffmind/db'

import { isAuthEnabled } from '../../utils/auth'

export default defineEventHandler((event) => {
  if (!isAuthEnabled()) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Auth disabled',
      message: 'Authentication is disabled for this environment.',
    })
  }

  return getAuth().handler(toWebRequest(event))
})
