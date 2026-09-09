import assert from "node:assert/strict"
import test from "node:test"
import { localProviderOrigin } from "./local-provider-origin.mjs"

test("allows only explicit loopback provider origins plus an opted public origin", () => {
  assert.equal(localProviderOrigin(""), "")
  assert.equal(localProviderOrigin("http://127.0.0.1:8011"), "http://127.0.0.1:8011")
  assert.equal(localProviderOrigin("https://proxy.clashk.ing", { publicOrigin: "https://proxy.clashk.ing" }), "https://proxy.clashk.ing")
  for (const value of ["http://localhost:8011", "http://127.0.0.1", "http://127.0.0.1:80", "http://127.0.0.1:8011/private", "https://127.0.0.1:8011", "http://user:pass@127.0.0.1:8011"]) {
    assert.throws(() => localProviderOrigin(value))
  }
})
