export const localProviderOrigin = (value, { publicOrigin } = {}) => {
  if (value === "") return ""
  let url
  try { url = new URL(value) } catch { throw new Error("Local provider origin must be an absolute URL") }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Local provider origin cannot include credentials, a path, query, or fragment")
  }
  if (publicOrigin !== undefined && url.origin === publicOrigin) return url.origin
  const port = Number(url.port)
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Local provider origin must use an explicit nonprivileged 127.0.0.1 port")
  }
  return url.origin
}
