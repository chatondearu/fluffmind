import { auth } from '@fluffmind/db'

export default defineEventHandler((event) => {
  return auth.handler(toWebRequest(event))
})
