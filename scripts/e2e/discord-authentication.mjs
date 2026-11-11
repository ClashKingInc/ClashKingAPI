// Real Auth API -> token exchange -> dfx-authenticated profile -> encrypted SQL.
import assert from 'node:assert/strict';
export async function verifyDiscordAuthentication({db,origin,provider}){
 const ids=['999999999999994971','999999999999994972'];
 const login=async(index)=>{
  const response=await fetch(origin+'/v2/auth/discord',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'sdk-code-'+index,code_verifier:'v'.repeat(64),redirect_uri:'http://localhost:3002/auth/callback',device_id:'sdk-device-'+index})});
  const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.user.user_id,ids[index]);assert(body.access_token&&body.refresh_token);
 };
 try{
  await Promise.all(ids.map((_,index)=>login(index)));
  assert.equal(provider.authCodeCalls,2,'Each authorization code is exchanged exactly once');
  assert.equal(provider.profileRetries,1,'dfx retried the declared profile 429');
  const rows=(await db.query('SELECT access_token_ciphertext FROM auth_discord_tokens WHERE user_id=ANY($1::text[])',[ids])).rows;
  assert.equal(rows.length,2);assert(rows.every(row=>!row.access_token_ciphertext.includes('sdk-access-')));
  console.log('PASS actual Discord login: concurrent isolated OAuth tokens, one code exchange each, SDK 429 profile retry, encrypted stored credentials');
 }finally{await db.query('DELETE FROM auth_users WHERE user_id=ANY($1::text[])',[ids]);}
}
