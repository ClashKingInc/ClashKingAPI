import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('both shared packages include the unmodified repository license', () => {
  const result = spawnSync(process.execPath, [new URL('./prepare-package-license.mjs', import.meta.url).pathname])
  assert.equal(result.status, 0)
  const expected = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8')
  for (const name of ['api-contracts', 'api-client']) {
    const base = new URL(`../packages/${name}/`, import.meta.url)
    assert.equal(readFileSync(new URL('LICENSE', base), 'utf8'), expected)
    const manifest = JSON.parse(readFileSync(new URL('package.json', base), 'utf8'))
    assert.equal(manifest.license, 'SEE LICENSE IN LICENSE')
    assert.equal(manifest.scripts.prepack, 'node ../../scripts/prepare-package-license.mjs')
  }
})
