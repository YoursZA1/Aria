/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'node:http'
import { env as nodeEnv } from 'node:process'
import { serveAria } from '../plugins/aria-serve.js'

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
  includeFiles: '{.cursor/skills/**,src/**,plugins/**,docs/**}',
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  void nodeEnv.OPENAI_API_KEY
  void nodeEnv.CURSOR_API_KEY
  void nodeEnv.GOOGLE_CSE_API_KEY
  void nodeEnv.GOOGLE_CSE_CX
  await serveAria(req, res)
}
