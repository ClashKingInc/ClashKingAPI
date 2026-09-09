import { Schema } from "effect"
import { expect, it } from "vitest"
import { CreateDeveloperApplicationInput, UpdateDeveloperApplicationInput } from "./admin.js"

it.each([CreateDeveloperApplicationInput, UpdateDeveloperApplicationInput])("preserves current Admin trim-before-length validation %#", schema => {
  const decode = Schema.decodeUnknownSync(schema)
  expect(decode({ developer_name: "  Developer  " })).toEqual({ developer_name: "Developer" })
  expect(decode({ developer_name: ` ${"x".repeat(120)} ` })).toEqual({ developer_name: "x".repeat(120) })
  for (const developer_name of ["", " \t ", "x".repeat(121)]) expect(() => decode({ developer_name })).toThrow()
})
