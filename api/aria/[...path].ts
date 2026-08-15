import type { IncomingMessage, ServerResponse } from 'node:http'
import { serveAria } from '../../plugins/aria-serve.js'

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
  includeFiles: '{.cursor/skills/**,src/**,plugins/**,docs/**}',
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await serveAria(req, res)
}
