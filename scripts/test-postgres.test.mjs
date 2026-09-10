import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

const runner = new URL("./test-postgres.sh",import.meta.url)
const fixture = (fn) => {
  const root=mkdtempSync(join(tmpdir(),"api-pg-runner-"))
  try {
    const api=join(root,"api"),schema=join(root,"schema checkout"),log=join(root,"calls.log")
    for(const directory of [join(api,"scripts"),join(api,"workers/api/test/postgres/nested"),join(schema,"scripts"),join(schema,"database/timescale")]) mkdirSync(directory,{recursive:true})
    copyFileSync(runner,join(api,"scripts/test-postgres.sh"))
    writeFileSync(join(api,"scripts/list-retained-postgres-suites.mjs"), `import { readdirSync } from 'node:fs';
for (const file of readdirSync('workers/api/test/postgres', {recursive:true}).filter(file => file.endsWith('.test.ts'))) process.stdout.write('workers/api/test/postgres/' + file + '\\0');`)
    writeFileSync(join(schema,"database/go.mod"),"module fixture\n\ngo 1.25.0\n")
    // Fake only the schema-owned database boundary. It records argv and never
    // starts Docker, invokes Goose/npm, or connects to any database.
    writeFileSync(join(schema,"scripts/with-test-timescale.sh"),[
      '#!/usr/bin/env bash', 'set -euo pipefail',
      'printf \'%s\\0\' "$@" >> "$RUNNER_TEST_LOG"',
      'printf \'\\n\' >> "$RUNNER_TEST_LOG"',
      'exit "${RUNNER_TEST_EXIT:-0}"', '',
    ].join("\n"))
    const run=(args=[schema],extra={})=>spawnSync("bash",[join(api,"scripts/test-postgres.sh"),...args],{
      cwd:root,encoding:"utf8",env:{...process.env,RUNNER_TEST_LOG:log,...extra},
    })
    return fn({api,schema,log,run})
  } finally { rmSync(root,{recursive:true,force:true}) }
}

test("CI reads the authoritative nested Go module and runs runner checks",()=>{
  const workflow=readFileSync(new URL("../.github/workflows/ci.yml",import.meta.url),"utf8")
  assert.match(workflow,/go-version-file: \.schema-test\/database\/go\.mod/u)
  assert.doesNotMatch(workflow,/go-version-file: \.schema-test\/go\.mod/u)
  assert.match(workflow,/npm run test:scripts/u)
  assert.match(workflow,/test-postgres\.sh --check \.schema-test/u)
  assert.match(workflow,/API_SCHEMA_TEST_REF \|\| '5b10ae2d9c1f2b9b0246c323ed897eb28c08df1b'/u)
})

test("CI and package preparation retain strict peer dependency validation",()=>{
  for(const file of ["ci.yml","release-api-packages.yml"]) {
    const workflow=readFileSync(new URL(`../.github/workflows/${file}`,import.meta.url),"utf8")
    assert.doesNotMatch(workflow,/--legacy-peer-deps/u)
    const commands=workflow.match(/npm ci[^\n]*/gu)??[]
    assert.ok(commands.length>0)
    for(const command of commands) assert.match(command,/--strict-peer-deps/u)
  }
})

test("validates the nested schema layout without invoking the database harness",()=>fixture(({schema,log,run})=>{
  const checked=run(["--check",schema])
  assert.equal(checked.status,0,checked.stderr)
  assert.match(checked.stdout,/no database was started/u)
  assert.throws(()=>readFileSync(log),{code:"ENOENT"})
}))

test("rejects missing schema prerequisites, bad arguments and empty suites",()=>fixture(({schema,run})=>{
  assert.equal(run([]).status,2)
  assert.match(run([join(schema,"absent")]).stderr,/directory does not exist/u)
  const empty=run()
  assert.equal(empty.status,1)
  assert.match(empty.stderr,/No PostgreSQL tests/u)
  rmSync(join(schema,"database/go.mod"))
  writeFileSync(join(schema,"go.mod"),"module wrong-root\n")
  const missing=run(["--check",schema])
  assert.equal(missing.status,1)
  assert.match(missing.stderr,/database\/go\.mod/u)
}))

test("fails discovery before invoking a database when the suite directory is missing",()=>fixture(({api,log,run})=>{
  rmSync(join(api,"workers/api/test/postgres"),{recursive:true})
  assert.notEqual(run().status,0)
  assert.throws(()=>readFileSync(log),{code:"ENOENT"})
}))

test("runs every nested suite separately with intact paths and the explicit schema version",()=>fixture(({api,log,run})=>{
  for(const name of ["one.test.ts","nested/two with spaces.test.ts"]) writeFileSync(join(api,"workers/api/test/postgres",name),"")
  const result=run()
  assert.equal(result.status,0,result.stderr)
  const calls=readFileSync(log,"utf8").trimEnd().split("\n").map(line=>line.split("\0").slice(0,-1))
  assert.equal(calls.length,2)
  for(const call of calls) assert.deepEqual(call.slice(0,-1),["--profile","retained-api","--","npm","run","test:postgres","--"])
  assert.deepEqual(calls.map(call=>call.at(-1)).sort(),["workers/api/test/postgres/nested/two with spaces.test.ts","workers/api/test/postgres/one.test.ts"])
  assert.match(result.stdout,/Completed 2 isolated PostgreSQL suites/u)
}))

test("preserves a failing harness exit and stops before the next database",()=>fixture(({api,log,run})=>{
  for(const name of ["one.test.ts","two.test.ts"]) writeFileSync(join(api,"workers/api/test/postgres",name),"")
  const result=run(undefined,{RUNNER_TEST_EXIT:"17"})
  assert.equal(result.status,17)
  assert.equal(readFileSync(log,"utf8").trimEnd().split("\n").length,1)
  assert.doesNotMatch(result.stdout,/Completed/u)
}))

test("keep-going records failures, runs each isolated suite, and remains red",()=>fixture(({api,schema,log,run})=>{
  for(const name of ["one.test.ts","two.test.ts"]) writeFileSync(join(api,"workers/api/test/postgres",name),"")
  const result=run(["--keep-going",schema],{RUNNER_TEST_EXIT:"17"})
  assert.equal(result.status,1)
  assert.equal(readFileSync(log,"utf8").trimEnd().split("\n").length,2)
  assert.match(result.stderr,/2 of 2 isolated PostgreSQL suites failed/u)
  assert.doesNotMatch(result.stdout,/Completed/u)
}))
