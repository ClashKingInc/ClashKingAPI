import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import test from 'node:test'
import { retainedPostgresSuites, deferredPostgresSuites, validatePostgresInventory } from './retained-postgres-suites.mjs'

test('every archived SQL suite is classified and retained suites exclude deferred orchestration', () => {
  const files = readdirSync(new URL('../workers/api/test/postgres/', import.meta.url), {recursive:true}).filter(file => file.endsWith('.test.ts'))
  assert.deepEqual(validatePostgresInventory(files), retainedPostgresSuites)
  assert.equal(retainedPostgresSuites.length, 40)
  assert.equal(deferredPostgresSuites.length, 30)
  assert.ok(retainedPostgresSuites.includes('dashboard-server-link-policy.test.ts'))
  assert.ok(retainedPostgresSuites.includes('tracking-operations.test.ts'))
  assert.ok(retainedPostgresSuites.includes('league-analytics.test.ts'))
  assert.ok(retainedPostgresSuites.includes('legacy-base-import.test.ts'))
  assert.ok(retainedPostgresSuites.includes('personal-bases.test.ts'))
  assert.ok(retainedPostgresSuites.includes('stats-history.test.ts'))
  assert.ok(deferredPostgresSuites.includes('ticket-runtime.test.ts'))
  assert.ok(deferredPostgresSuites.includes('dashboard-roster-configuration.test.ts'))
})

test('new and missing files require explicit review', () => {
  const files = [...retainedPostgresSuites, ...deferredPostgresSuites]
  assert.throws(() => validatePostgresInventory([...files, 'nested/new.test.ts']), /unclassified=nested\/new.test.ts/)
  assert.throws(() => validatePostgresInventory(files.slice(1)), /missing=account-mutations.test.ts/)
})
