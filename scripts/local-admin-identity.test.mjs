import assert from 'node:assert/strict';
import test from 'node:test';
import { get } from 'node:http';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { createLocalAdminIdentity } from './local-admin-identity.mjs';

test('rejects non-loopback API destinations', async () => {
  for (const apiOrigin of ['https://api.clashk.ing', 'http://192.168.5.62:8787', 'http://127.0.0.1:8787/other', 'http://user@127.0.0.1:8787']) {
    await assert.rejects(createLocalAdminIdentity({apiOrigin}), /loopback/);
  }
});

test('signs only local Admin AJAX requests and preserves actual token verification', async () => {
  let forwarded = 0;
  const adapter = await createLocalAdminIdentity({apiOrigin:'http://127.0.0.1:8787',port:0,fetcher:async (url, init) => {
    forwarded++;
    assert.equal(url.origin, 'http://127.0.0.1:8787');
    assert.equal(init.headers.has('cookie'), false);
    assert.equal(init.headers.has('authorization'), false);
    if (init.method === 'OPTIONS') {
      assert.equal(init.headers.has('cf-access-jwt-assertion'), false);
      return new Response(null,{status:204});
    }
    const certs = await adapter.certificates(new Request(`${adapter.bindings.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`)).json();
    const result = await jwtVerify(init.headers.get('cf-access-jwt-assertion'), createLocalJWKSet(certs), {
      issuer:adapter.bindings.ACCESS_TEAM_DOMAIN,audience:adapter.bindings.ACCESS_AUDIENCE,algorithms:['RS256'],
    });
    assert.equal(result.payload.sub,'local-developer');
    assert.ok(result.payload.exp - result.payload.iat <= 60);
    return Response.json({id:result.payload.sub});
  }});
  const origin = await adapter.listen();
  try {
    const headers = {origin:'http://localhost:3000','x-requested-with':'XMLHttpRequest',cookie:'untrusted','authorization':'untrusted','cf-access-jwt-assertion':'untrusted'};
    const result = await fetch(`${origin}/v2/admin/me`,{headers});
    assert.equal(result.status,200);
    assert.deepEqual(await result.json(),{id:'local-developer'});
    assert.equal(result.headers.get('cache-control'),'no-store');
    for (const input of [
      {path:'/v2/admin/me',headers:{}},
      {path:'/v2/admin/me',headers:{...headers,origin:'https://evil.invalid'}},
      {path:'/v2/admin/me',headers:{origin:'http://localhost:3000'}},
      {path:'/v2/guilds',headers},
      {path:'/v2/admin/../../guilds',headers},
    ]) assert.equal((await fetch(`${origin}${input.path}`,{headers:input.headers})).status,403,JSON.stringify(input));
    const wrongHostStatus = await new Promise((resolve, reject) => {
      get(`${origin}/v2/admin/me`, {headers:{...headers,host:'evil.invalid'}}, response => {
        response.resume();
        resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(wrongHostStatus,403);
    assert.equal(forwarded,1);
    assert.equal((await fetch(`${origin}/v2/admin/me`,{method:'OPTIONS',headers:{origin:'http://localhost:3000','access-control-request-method':'GET'}})).status,204);
    assert.equal(forwarded,2);
    assert.equal(adapter.certificates(new Request('https://discord.com/api')),undefined);
  } finally { await adapter.close(); }
});
