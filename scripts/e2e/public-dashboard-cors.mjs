import assert from 'node:assert/strict'

// Exercise the real Worker boundary used by the credentialed dashboard client.
export async function verifyPublicDashboardCors({origin}) {
  const url=origin+'/v2/cwl/%23PYL/seasons'
  for(const site of ['http://localhost:3002','http://127.0.0.1:3002']) {
    const response=await fetch(url,{headers:{origin:site,cookie:'fixture=1'}})
    assert.equal(response.status,200)
    assert.equal(response.headers.get('access-control-allow-origin'),site)
    assert.equal(response.headers.get('access-control-allow-credentials'),'true')
    assert.match(response.headers.get('vary')??'',/Origin/i)
    assert.ok(Array.isArray((await response.json()).items))
    const preflight=await fetch(url,{method:'OPTIONS',headers:{origin:site,'access-control-request-method':'GET','access-control-request-headers':'authorization'}})
    assert.equal(preflight.status,204)
    assert.equal(preflight.headers.get('access-control-allow-origin'),site)
    assert.equal(preflight.headers.get('access-control-allow-credentials'),'true')
    assert.match(preflight.headers.get('access-control-allow-headers')??'',/Authorization/i)
  }
  const anonymous=await fetch(url,{headers:{origin:'https://external.example'}})
  assert.equal(anonymous.status,200)
  assert.equal(anonymous.headers.get('access-control-allow-origin'),'*')
  assert.equal(anonymous.headers.get('access-control-allow-credentials'),null)
  assert.match(anonymous.headers.get('vary')??'',/Origin/i)
  const denied=await fetch(origin+'/v2/auth/me',{headers:{origin:'https://external.example'}})
  assert.notEqual(denied.headers.get('access-control-allow-origin'),'https://external.example')
  assert.equal(denied.headers.get('access-control-allow-credentials'),null)
  console.log('PASS public CWL CORS: two approved credentialed origins, preflight, anonymous public access and private-origin denial')
}
