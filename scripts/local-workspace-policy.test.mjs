import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceOrigin,allowedProductionRead } from './local-workspace-policy.mjs';
test('workspace origins accept contributor tunnels but reject production',()=>{
 assert.equal(workspaceOrigin('https://local-api.example.com'),'https://local-api.example.com');
 for(const value of ['https://api.clashk.ing','https://dash.clashk.ing','http://remote.example.com','https://u:p@example.com','https://local.example.com/path'])assert.throws(()=>workspaceOrigin(value));
});
test('archive exception is read-only and hostname bounded',()=>{
 assert.equal(allowedProductionRead(new Request('https://wars.clashk.ing/packs/000001.pack')),true);
 assert.equal(allowedProductionRead(new Request('https://wars.clashk.ing/packs/000001.pack',{method:'POST'})),false);
 assert.equal(allowedProductionRead(new Request('https://wars.clashk.ing.evil.test/')),false);
 assert.equal(allowedProductionRead(new Request('https://api.clashk.ing/')),false);
});
