import type { IncomingMessage, ServerResponse } from 'node:http'
import { ariaPathFromNodeUrl } from './aria-path.js'
import { handleBrowserRequest } from './aria-browser.js'
import { handleCursorRequest } from './aria-cursor.js'

export { ariaPathFromNodeUrl }

export async function serveAria(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = ariaPathFromNodeUrl(req.url ?? '/')
  if (!url.startsWith('/__aria')) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: false, error: 'Not an Aria route' }))
    return
  }
  if (url.startsWith('/__aria/cursor')) {
    await handleCursorRequest(url, req, res)
    return
  }
  await handleBrowserRequest(url, req, res)
}
