/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'node:http'
import { serveAria } from '../plugins/aria-serve.js'

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
  includeFiles: '{.cursor/skills/**,src/**,plugins/**,docs/**}',
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  void process.env.OPENAI_API_KEY
  void process.env.CURSOR_API_KEY
  void process.env.GOOGLE_CSE_API_KEY
  void process.env.GOOGLE_CSE_CX
  await serveAria(req, res)
}
