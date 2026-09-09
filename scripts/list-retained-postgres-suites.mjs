import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validatePostgresInventory } from './retained-postgres-suites.mjs'

const root = fileURLToPath(new URL('../workers/api/test/postgres/', import.meta.url))
const files = readdirSync(root, { recursive: true }).filter(file => file.endsWith('.test.ts'))
for (const suite of validatePostgresInventory(files)) process.stdout.write(`workers/api/test/postgres/${suite}\0`)
