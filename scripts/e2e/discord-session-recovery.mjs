// Real local Worker/auth/SQL path. Discord alone uses a loopback OAuth fixture.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import { build } from 'esbuild'
import pg from 'pg'

assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE, '1')
const dsn = new URL(process.env.TEST_DATABASE_URL)
assert.equal(dsn.hostname, '127.0.0.1')
assert.equal(dsn.pathname, '/clashking_test')

const db = new pg.Client({ connectionString: dsn.href })
const userRevoked = '999999999999991301'
const userRecoverable = '999999999999991302'
const userRotated = '999999999999991303'
const userOrphaned = '999999999999991304'
const userConfigError = '999999999999991305'
const userEmail = '999999999999991306'
const allUsers = [userRevoked, userRecoverable, userRotated, userOrphaned, userConfigError, userEmail]

const profileByAccess = new Map([
  ['recoverable-fresh-access', { id: userRecoverable, username: 'Recovered', discriminator: '0', avatar: null }],
  ['rotated-valid-access', { id: userRotated, username: 'Rotated', discriminator: '0', avatar: null }],
])
const refreshHandlers = new Map([
  ['revoked-refresh', { status: 400, body: { error: 'invalid_grant' } }],
  ['recoverable-refresh', {
    status: 200,
    body: { access_token: 'recoverable-fresh-access', refresh_token: 'recoverable-next-refresh', expires_in: 604800 },
  }],
  ['config-error-refresh', { status: 400, body: { error: 'invalid_client' } }],
])

let tokenCalls = 0
let profileCalls = 0
let api
let logs = ''

const provider = createServer(async (req, res) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const rawBody = Buffer.concat(chunks).toString('utf8')
  res.setHeader('content-type', 'application/json')

  if (req.url === '/api/oauth2/token' || req.url === '/oauth2/token') {
    tokenCalls++
    const params = new URLSearchParams(rawBody)
    const refresh = params.get('refresh_token') ?? ''
    const handler = refreshHandlers.get(refresh)
    if (!handler) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'invalid_grant' }))
      return
    }
    res.statusCode = handler.status
    res.end(JSON.stringify(handler.body))
    return
  }

  if (req.url === '/api/v10/users/@me') {
    profileCalls++
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    const profile = profileByAccess.get(bearer)
    if (!profile) {
      res.statusCode = 401
      res.end(JSON.stringify({ message: '401: Unauthorized', code: 0 }))
      return
    }
    res.statusCode = 200
    res.end(JSON.stringify(profile))
    return
  }

  res.statusCode = 500
  res.end(JSON.stringify({ error: 'unexpected_path', path: req.url }))
})

const secret = randomBytes(32).toString('base64url')
const refreshSecret = randomBytes(32).toString('base64url')
const encryptionKey = randomBytes(32).toString('base64url')
const port = 8898
const origin = `http://127.0.0.1:${port}`
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

const signAccess = (userId, device) =>
  new SignJWT({ device })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setAudience('clashking-native')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret))

const signRefresh = (userId, device) =>
  new SignJWT({ device })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setAudience('clashking-native')
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(new TextEncoder().encode(refreshSecret))

try {
  await db.connect()
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve))

  const bundle = await build({
    entryPoints: ['workers/api/src/fernet.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
  })
  const { encryptStoredFernet } = await import(
    'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
  )

  for (const id of [userRevoked, userRecoverable, userRotated, userOrphaned, userConfigError]) {
    await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')", [id])
  }
  await db.query(
    "INSERT INTO auth_users(user_id,provider,email_hash,username,password_hash) VALUES($1,'email','session-recovery-email-hash','EmailUser','not-a-password')",
    [userEmail],
  )

  const seedSession = async (userId, deviceId, accessPlain, refreshPlain) => {
    const refreshJwt = await signRefresh(userId, deviceId)
    await db.query(
      "INSERT INTO auth_refresh_tokens(token_hash,user_id,device_id,expires_at) VALUES($1,$2,$3,now()+interval '30 days')",
      [sha256(refreshJwt), userId, deviceId],
    )
    if (accessPlain !== null && refreshPlain !== null) {
      const accessCipher = await encryptStoredFernet(accessPlain, encryptionKey)
      const refreshCipher = await encryptStoredFernet(refreshPlain, encryptionKey)
      await db.query(
        "INSERT INTO auth_discord_tokens(user_id,device_id,access_token_ciphertext,refresh_token_ciphertext,expires_at) VALUES($1,$2,$3,$4,now()+interval '3 days')",
        [userId, deviceId, accessCipher, refreshCipher],
      )
    }
    return { accessJwt: await signAccess(userId, deviceId), refreshJwt }
  }

  const revoked = await seedSession(userRevoked, 'dev-revoked', 'revoked-access', 'revoked-refresh')
  const recoverable = await seedSession(userRecoverable, 'dev-recoverable', 'stale-early-revoked-access', 'recoverable-refresh')
  const rotated = await seedSession(userRotated, 'android-build-1', 'rotated-valid-access', 'recoverable-refresh')
  const orphaned = await seedSession(userOrphaned, 'android-build-orphan', null, null)
  const configErr = await seedSession(userConfigError, 'dev-config-err', 'config-err-access', 'config-error-refresh')
  const emailSession = await seedSession(userEmail, 'dev-email', null, null)

  api = spawn(process.execPath, ['scripts/start-local-rewrite-api.mjs'], {
    env: {
      ...process.env,
      CLASHKING_LOCAL_API_PORT: String(port),
      CLASHKING_E2E_JWT_ACCESS_SECRET: secret,
      CLASHKING_E2E_JWT_REFRESH_SECRET: refreshSecret,
      CLASHKING_E2E_DATA_ENCRYPTION_KEY: encryptionKey,
      CLASHKING_LOCAL_DISCORD_CLIENT_ID: '999999999999999999',
      CLASHKING_LOCAL_DISCORD_CLIENT_SECRET: 'fixture',
      CLASHKING_LOCAL_DISCORD_BOT_TOKEN: 'fixture',
      CLASHKING_LOCAL_DISCORD_TEST_ORIGIN: `http://127.0.0.1:${provider.address().port}`,
      CLASHKING_LOCAL_ARCHIVE_BRIDGE: '0',
      CLASHKING_LOCAL_PRODUCTION_READS: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  api.stdout.on('data', (d) => (logs += d))
  api.stderr.on('data', (d) => (logs += d))

  let ready = false
  for (let i = 0; i < 120; i++) {
    if (api.exitCode !== null) throw Error(logs.slice(-5000))
    try {
      ready = (await fetch(`${origin}/v2/health`)).ok && logs.includes('isolated_api_ready')
    } catch {}
    if (ready) break
    await new Promise((r) => setTimeout(r, 500))
  }
  assert(ready, logs.slice(-5000))

  // 1. Revoked Discord token with future expires_at: retries refresh once,
  // hits invalid_grant, revokes device session, and returns 401 (not 403/400).
  const revokedRes = await fetch(`${origin}/v2/auth/me`, {
    headers: { authorization: `Bearer ${revoked.accessJwt}` },
  })
  assert.equal(revokedRes.status, 401, JSON.stringify(await revokedRes.json()))
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM auth_discord_tokens WHERE user_id=$1', [userRevoked])).rows[0].n,
    0,
    'Revoked Discord token row must be deleted',
  )
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM auth_refresh_tokens WHERE user_id=$1', [userRevoked])).rows[0].n,
    0,
    'Device refresh token must be revoked so app refresh returns 401',
  )
  const revokedRefreshRes = await fetch(`${origin}/v2/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: revoked.refreshJwt, device_id: 'dev-revoked' }),
  })
  assert.equal(revokedRefreshRes.status, 401, 'ClashKing refresh must reject the revoked device session')

  // 2. Early-invalidated access token with valid refresh token recovers transparently.
  const tokensBeforeRecover = tokenCalls
  const recoverRes = await fetch(`${origin}/v2/auth/me`, {
    headers: { authorization: `Bearer ${recoverable.accessJwt}` },
  })
  const recoverBody = await recoverRes.json()
  assert.equal(recoverRes.status, 200, JSON.stringify(recoverBody))
  assert.equal(recoverBody.user_id, userRecoverable)
  assert.equal(tokenCalls - tokensBeforeRecover, 1, 'Expected one forced Discord refresh')

  // 3. Native refresh rotating device_id (Android OS update) migrates auth_discord_tokens.
  const rotateRes = await fetch(`${origin}/v2/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: rotated.refreshJwt, device_id: 'android-build-2' }),
  })
  const rotateBody = await rotateRes.json()
  assert.equal(rotateRes.status, 200, JSON.stringify(rotateBody))
  const rotatedMe = await fetch(`${origin}/v2/auth/me`, {
    headers: { authorization: `Bearer ${rotateBody.access_token}` },
  })
  assert.equal(rotatedMe.status, 200, JSON.stringify(await rotatedMe.json()))
  const rotatedRows = (await db.query('SELECT device_id FROM auth_discord_tokens WHERE user_id=$1', [userRotated])).rows
  assert.deepEqual(rotatedRows.map((r) => r.device_id), ['android-build-2'])

  // 4. Already-orphaned Discord device session revokes its refresh token on 401.
  const orphanRes = await fetch(`${origin}/v2/auth/me`, {
    headers: { authorization: `Bearer ${orphaned.accessJwt}` },
  })
  assert.equal(orphanRes.status, 401, JSON.stringify(await orphanRes.json()))
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM auth_refresh_tokens WHERE user_id=$1', [userOrphaned])).rows[0].n,
    0,
    'Orphaned Discord session refresh token must be revoked',
  )

  // 5. Email user hitting a Discord-only route must NOT lose its ClashKing refresh token.
  const emailGuildsRes = await fetch(`${origin}/v2/guilds`, {
    headers: { authorization: `Bearer ${emailSession.accessJwt}` },
  })
  assert.equal(emailGuildsRes.status, 401, JSON.stringify(await emailGuildsRes.json()))
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM auth_refresh_tokens WHERE user_id=$1', [userEmail])).rows[0].n,
    1,
    'Email account refresh token must remain intact',
  )

  // 6. Server OAuth misconfiguration (invalid_client) must NOT revoke the user's session.
  const configErrRes = await fetch(`${origin}/v2/auth/me`, {
    headers: { authorization: `Bearer ${configErr.accessJwt}` },
  })
  assert.equal(configErrRes.status, 400, JSON.stringify(await configErrRes.json()))
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM auth_refresh_tokens WHERE user_id=$1', [userConfigError])).rows[0].n,
    1,
    'Non-invalid_grant OAuth errors must preserve the user session',
  )

  assert(profileCalls >= 3)

  if (process.env.CLASHKING_E2E_EXPO_REPO) {
    const { mkdtemp, mkdir, readFile, writeFile, rename, rm } = await import('node:fs/promises')
    const { join, resolve } = await import('node:path')
    const { createRequire } = await import('node:module')
    const app = process.env.CLASHKING_E2E_EXPO_REPO
    const directory = await mkdtemp(join(app, '.discord-recovery-e2e-'))
    const apiRepo = resolve(new URL('../../', import.meta.url).pathname)
    const require = createRequire(join(apiRepo, 'package.json'))
    class Files {
      constructor(path) { this.path = path }
      async getItem(key) { try { return await readFile(join(this.path, encodeURIComponent(key)), 'utf8') } catch (e) { if (e.code === 'ENOENT') return null; throw e } }
      async setItem(key, value) { await mkdir(this.path, { recursive: true }); const p = join(this.path, encodeURIComponent(key)), tmp = p + '.tmp'; await writeFile(tmp, value, { mode: 0o600 }); await rename(tmp, p) }
      async removeItem(key) { await rm(join(this.path, encodeURIComponent(key)), { force: true }) }
      async clear() { await rm(this.path, { recursive: true, force: true }); await mkdir(this.path, { recursive: true }) }
    }
    try {
      const source = `export {TokenService} from '${app}/src/services/auth/token-service';export {NoopAuthRefreshLock} from '${app}/src/services/auth/refresh-lock';export {AuthSessionRepository} from '${app}/src/services/storage/auth-storage';export {AuthService} from '${app}/src/features/auth/auth-service';export {createAppContractClient} from '${app}/src/core/api/app-contract-client';export {withBearerToken} from '${app}/src/core/api/contract-api';export {httpTransport} from '@clashking/api-client';`
      const outfile = join(directory, 'services.mjs')
      await build({
        stdin: { contents: source, resolveDir: app },
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile,
        external: ['@clashking/native'],
        plugins: [{ name: 'shared-effect-runtime', setup(b) { b.onResolve({ filter: /^effect(?:\/.*)?$/ }, (args) => ({ path: require.resolve(args.path) })) } }],
        alias: {
          '@clashking/api-client': join(apiRepo, 'packages/api-client/dist/index.js'),
          '@clashking/api-contracts/expo': join(apiRepo, 'packages/api-contracts/dist/expo.js'),
          '@clashking/api-contracts': join(apiRepo, 'packages/api-contracts/dist/index.js'),
        },
      })
      const services = await import(outfile)
      const preferences = new Files(join(directory, 'preferences'))
      const secure = new Files(join(directory, 'secure'))

      // A. Android session backfill: pre-fix Android stored device_id=null while
      // Build.ID later changed from android-old to android-new. AuthSessionRepository
      // must bind deviceId from the stored JWT's device claim, keeping refresh on android-old.
      const androidUser = '999999999999991307'
      allUsers.push(androidUser)
      await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')", [androidUser])
      profileByAccess.set('android-valid-access', { id: androidUser, username: 'AndroidUser', discriminator: '0', avatar: null })
      const androidSeed = await seedSession(androidUser, 'android-old', 'android-valid-access', 'recoverable-refresh')
      await secure.setItem(
        'shared_auth_session_v1',
        JSON.stringify({ access_token: androidSeed.accessJwt, refresh_token: androidSeed.refreshJwt }),
      )
      const androidIdentity = { getDeviceId: async () => 'android-new', getDeviceName: async () => 'Pixel' }
      const androidSessions = new services.AuthSessionRepository(secure, preferences, 'android', androidIdentity.getDeviceId)
      const readSession = await androidSessions.read()
      assert.equal(readSession.deviceId, 'android-old', 'Android must preserve the JWT device claim instead of drifting to the new OS Build.ID')
      let androidAuth
      const androidTokens = new services.TokenService({
        apiV2Url: `${origin}/v2`,
        platform: 'android',
        sessions: androidSessions,
        refreshLock: new services.NoopAuthRefreshLock(),
        deviceIdentity: androidIdentity,
        onSessionRejected: async () => { await androidAuth.handleSessionRejected() },
      })
      const androidApi = services.withBearerToken(
        services.createAppContractClient({ baseUrl: origin, transport: services.httpTransport(), web: false, tokens: androidTokens }),
        androidTokens,
      )
      androidAuth = new services.AuthService({
        api: androidApi,
        tokens: androidTokens,
        preferences,
        environment: 'production',
        platform: 'native',
      })
      await androidAuth.initializeAuth()
      assert.equal(androidAuth.state.isAuthenticated, true)
      assert.equal(androidAuth.state.currentUser.userId, androidUser)

      // B. Revoked Discord grant during Expo startup signs out cleanly to Login
      // without throwing to StartupErrorScreen.
      const revokedAppSeed = await seedSession(userRevoked, 'dev-revoked-app', 'revoked-access', 'revoked-refresh')
      await androidTokens.saveTokens(revokedAppSeed.accessJwt, revokedAppSeed.refreshJwt)
      await androidAuth.initializeAuth()
      assert.equal(androidAuth.state.isAuthenticated, false, 'Revoked Discord session must sign out to Login')
      assert.equal((await androidSessions.read()).refreshToken, null, 'Local tokens must be cleared after revoked Discord session')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }

  console.log('PASS Discord session recovery: revoked grant -> 401 + session cleanup, early access rejection -> transparent refresh, native device_id rotation -> token migration, orphaned Discord session cleanup, email session preserved, invalid_client preserved')
} finally {
  if (api && api.exitCode === null) {
    api.kill('SIGTERM')
    await Promise.race([once(api, 'exit'), new Promise((r) => setTimeout(r, 5000))])
    if (api.exitCode === null) api.kill('SIGKILL')
  }
  await db.query('DELETE FROM auth_users WHERE user_id=ANY($1::text[])', [allUsers]).catch(() => undefined)
  await new Promise((resolve) => provider.close(resolve))
  await db.end()
}
