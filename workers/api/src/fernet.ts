import { Context, Effect, Layer } from "effect"

import { UpstreamUnavailable } from "./errors.js"
import { WorkerEnvironment } from "./environment.js"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const decodeBase64 = (value: string): Uint8Array => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

const encodeBase64Url = (value: Uint8Array): string => {
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_")
}

const concat = (...values: ReadonlyArray<Uint8Array>): Uint8Array<ArrayBuffer> => {
  const output = new Uint8Array(values.reduce((length, value) => length + value.length, 0))
  let offset = 0
  for (const value of values) {
    output.set(value, offset)
    offset += value.length
  }
  return output
}

const keyBytes = (encoded: string): Uint8Array => {
  const trimmed = encoded.trim()
  const decoded = /^[0-9a-f]{64}$/iu.test(trimmed)
    ? Uint8Array.from(trimmed.match(/.{2}/gu) ?? [], (byte) => Number.parseInt(byte, 16))
    : decodeBase64(trimmed)
  if (decoded.length !== 32) throw new Error("Fernet key must decode to 32 bytes")
  return decoded
}

const tokenBytes = (stored: string): Uint8Array => {
  const first = decodeBase64(stored.trim())
  if (first[0] === 0x80) return first
  const inner = decoder.decode(first)
  const second = decodeBase64(inner)
  if (second[0] !== 0x80) throw new Error("Fernet token has an invalid version")
  return second
}

const signingKey = (key: Uint8Array) => crypto.subtle.importKey(
  "raw",
  key.slice(0, 16),
  { hash: "SHA-256", name: "HMAC" },
  false,
  ["sign", "verify"],
)

const encryptionKey = (key: Uint8Array) => crypto.subtle.importKey(
  "raw",
  key.slice(16),
  "AES-CBC",
  false,
  ["decrypt", "encrypt"],
)

export const decryptStoredFernet = async (stored: string, encodedKey: string): Promise<string> => {
  const token = tokenBytes(stored)
  if (token.length < 73 || token[0] !== 0x80) throw new Error("Fernet token is truncated")
  const signed = token.slice(0, -32)
  const signature = token.slice(-32)
  const valid = await crypto.subtle.verify("HMAC", await signingKey(keyBytes(encodedKey)), signature, signed)
  if (!valid) throw new Error("Fernet token signature is invalid")
  const iv = token.slice(9, 25)
  const ciphertext = token.slice(25, -32)
  if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) throw new Error("Fernet ciphertext is invalid")
  const plaintext = await crypto.subtle.decrypt(
    { iv, name: "AES-CBC" },
    await encryptionKey(keyBytes(encodedKey)),
    ciphertext,
  )
  return decoder.decode(plaintext)
}

export const encryptStoredFernet = async (
  plaintext: string,
  encodedKey: string,
  now = new Date(),
): Promise<string> => {
  const key = keyBytes(encodedKey)
  const header = new Uint8Array(9)
  header[0] = 0x80
  new DataView(header.buffer).setBigUint64(1, BigInt(Math.floor(now.valueOf() / 1_000)), false)
  const iv = crypto.getRandomValues(new Uint8Array(16))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { iv, name: "AES-CBC" },
    await encryptionKey(key),
    encoder.encode(plaintext),
  ))
  const signed = concat(header, iv, ciphertext)
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(key), signed))
  const fernet = encodeBase64Url(concat(signed, signature))
  return encodeBase64Url(encoder.encode(fernet))
}

export class StoredTokenCipher extends Context.Service<
  StoredTokenCipher,
  {
    readonly decrypt: (value: string) => Effect.Effect<string, UpstreamUnavailable>
    readonly encrypt: (value: string) => Effect.Effect<string, UpstreamUnavailable>
  }
>()("clashking/StoredTokenCipher") {
  static readonly layer = Layer.effect(
    StoredTokenCipher,
    Effect.gen(function* () {
      const bindings = yield* WorkerEnvironment
      const wrap = (message: string, operation: () => Promise<string>) => Effect.tryPromise({
        try: operation,
        catch: (cause) => new UpstreamUnavailable({ cause, message }),
      })
      return {
        decrypt: (value) => wrap("Stored token decryption failed", () =>
          decryptStoredFernet(value, bindings.DATA_ENCRYPTION_KEY)),
        encrypt: (value) => wrap("Stored token encryption failed", () =>
          encryptStoredFernet(value, bindings.DATA_ENCRYPTION_KEY)),
      }
    }),
  )
}
