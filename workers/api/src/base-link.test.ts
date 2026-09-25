import { describe, expect, it } from "vitest"

import { normalizeBaseLink } from "./base-link.js"

describe("Clash layout link normalization", () => {
  it.each([
    ["https://link.clashofclans.com/en?action=OpenLayout&id=TH17", "TH17"],
    [" https://link.clashofclans.com/es?id=TH12%3AWB%3AAAAA_foo-bar&action=OpenLayout&utm_source=share#ignored ", "TH12:WB:AAAA_foo-bar"],
    ["https://link.clashofclans.com/fr/?action=OpenLayout&id=TH11%3AHV%3AAAAA", "TH11:HV:AAAA"],
    ["https://LINK.CLASHOFCLANS.COM/jp?action=OpenLayout&id=TH10%3AWB%3AAAAA", "TH10:WB:AAAA"],
    ["https://link.clashofclans.com/?action=OpenLayout&id=BH10%3AHV%3AAAAA", "BH10:HV:AAAA"],
    ["https://link.clashofclans.com/pt-BR?action=OpenLayout&id=TH16%3AWB%3AAAAA", "TH16:WB:AAAA"],
  ])("accepts and canonicalizes %s", (input, id) => {
    expect(normalizeBaseLink(input)).toBe(`https://link.clashofclans.com/en?action=OpenLayout&id=${encodeURIComponent(id)}`)
  })

  it.each([
    "http://link.clashofclans.com/en?action=OpenLayout&id=TH17",
    "https://evil.test/en?action=OpenLayout&id=TH17",
    "https://link.clashofclans.com.evil.test/en?action=OpenLayout&id=TH17",
    "https://user:pass@link.clashofclans.com/en?action=OpenLayout&id=TH17",
    "https://link.clashofclans.com:444/en?action=OpenLayout&id=TH17",
    "https://link.clashofclans.com/layout?action=OpenLayout&id=TH17",
    "https://link.clashofclans.com/en/share?action=OpenLayout&id=TH17",
    "https://link.clashofclans.com/en?action=CopyArmy&id=TH17",
    "https://link.clashofclans.com/en?action=OpenLayout",
    "https://link.clashofclans.com/en?action=OpenLayout&action=OpenLayout&id=TH17",
    "https://link.clashofclans.com/en?action=OpenLayout&id=TH17&id=TH18",
    "https://link.clashofclans.com/en?Action=CopyArmy&action=OpenLayout&id=TH17",
    "https://link.clashofclans.com/en?action=OpenLayout&ID=TH18&id=TH17",
    "https://link.clashofclans.com/en?action=OpenLayout&id=%20TH17",
    "https://link.clashofclans.com/en?action=OpenLayout&id=TH17%2Fother",
  ])("rejects unsafe or ambiguous input %s", (input) => {
    expect(() => normalizeBaseLink(input)).toThrow()
  })
})
