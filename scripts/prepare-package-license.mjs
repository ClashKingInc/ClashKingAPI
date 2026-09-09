import { copyFileSync } from 'node:fs'

// Packages inherit this repository's existing license. Preserve its exact text;
// do not select a different license while fixing missing package metadata.
const source = new URL('../LICENSE', import.meta.url)
for (const name of ['api-contracts', 'api-client']) {
  copyFileSync(source, new URL(`../packages/${name}/LICENSE`, import.meta.url))
}
