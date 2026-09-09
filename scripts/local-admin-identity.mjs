import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

// Development adapter only: never imported by the deployable Worker. The
// Worker still verifies RS256, issuer, audience, expiration and identity.
export async function createLocalAdminIdentity({ apiOrigin, port = 8786, fetcher = fetch }) {
  const api = new URL(apiOrigin);
  if (api.protocol !== 'http:' || api.hostname !== '127.0.0.1' || !api.port || api.pathname !== '/' || api.username || api.password || api.search || api.hash) {
    throw new Error('Local Admin identity requires an explicit loopback API origin');
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid local Admin port');
  const issuer = 'https://local-admin.clashking.invalid';
  const audience = 'clashking-isolated-local-admin';
  const keys = await generateKeyPair('RS256');
  const publicKey = { ...await exportJWK(keys.publicKey), kid: 'local-admin', alg: 'RS256', use: 'sig' };
  const allowedOrigins = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);
  const server = createServer(async (incoming, outgoing) => {
    try {
      const address = server.address();
      const host = incoming.headers.host;
      const path = incoming.url ?? '';
      if (!address || typeof address === 'string' || ![`127.0.0.1:${address.port}`, `localhost:${address.port}`].includes(host) ||
          !['127.0.0.1', '::ffff:127.0.0.1'].includes(incoming.socket.remoteAddress) ||
          !allowedOrigins.has(incoming.headers.origin) || !path.startsWith('/v2/admin/')) {
        outgoing.writeHead(403).end('Local Admin requests only');
        return;
      }
      const upstream = new URL(path, api);
      if (upstream.origin !== api.origin || !upstream.pathname.startsWith('/v2/admin/')) {
        outgoing.writeHead(403).end('Local Admin requests only');
        return;
      }
      if (incoming.method !== 'OPTIONS' && incoming.headers['x-requested-with'] !== 'XMLHttpRequest') {
        outgoing.writeHead(403).end('AJAX request header required');
        return;
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined && !['host', 'connection', 'content-length', 'transfer-encoding', 'cf-access-jwt-assertion', 'authorization', 'cookie'].includes(name)) {
          headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        }
      }
      if (incoming.method !== 'OPTIONS') {
        headers.set('cf-access-jwt-assertion', await new SignJWT({
          email: 'developer@clashking.invalid', name: 'Local Developer',
        }).setProtectedHeader({ alg: 'RS256', kid: publicKey.kid })
          .setIssuer(issuer).setAudience(audience).setSubject('local-developer')
          .setIssuedAt().setExpirationTime('1m').sign(keys.privateKey));
      }
      const response = await fetcher(upstream, {
        method: incoming.method, headers, redirect: 'manual',
        ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: Readable.toWeb(incoming), duplex: 'half' }),
        signal: AbortSignal.timeout(30_000),
      });
      outgoing.statusCode = response.status;
      // fetch decodes HTTP content encodings; don't advertise the old wire size.
      response.headers.forEach((value, name) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(name)) outgoing.setHeader(name, value);
      });
      outgoing.setHeader('cache-control', 'no-store');
      if (response.body) await pipeline(Readable.fromWeb(response.body), outgoing);
      else outgoing.end();
    } catch {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end('Local Admin API unavailable');
    }
  });
  return {
    bindings: { ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUDIENCE: audience },
    certificates(request) {
      return request.url === `${issuer}/cdn-cgi/access/certs` && request.method === 'GET'
        ? Response.json({ keys: [publicKey] }) : undefined;
    },
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
      return `http://127.0.0.1:${server.address().port}`;
    },
    async close() {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
