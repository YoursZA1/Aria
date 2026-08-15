/** Map a Node/Vercel request URL onto the Vite `/__aria/*` paths the plugins already implement. */
export function ariaPathFromNodeUrl(raw: string): string {
  const u = new URL(raw || '/', 'http://aria.local')
  const mapped = u.searchParams.get('__path')
  if (mapped) {
    u.searchParams.delete('__path')
    const rest = mapped.replace(/^\/+/, '')
    return `/__aria/${rest}${u.search}`
  }
  let path = u.pathname
  if (path.startsWith('/api/aria')) {
    const rest = path.slice('/api/aria'.length)
    path = '/__aria' + (rest.startsWith('/') ? rest : `/${rest}`)
  }
  if (path === '/__aria') path = '/__aria/'
  return `${path}${u.search}`
}
