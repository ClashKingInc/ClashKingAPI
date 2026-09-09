import { Effect } from "effect"

import { UpstreamUnavailable } from "./errors.js"

const encode = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "")

const decode = (value: string): Uint8Array => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=")
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

const keyFor = async (secret: string, usage: KeyUsage): Promise<CryptoKey> => {
  if (secret.trim().length === 0) throw new Error("Encryption key is not configured")
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret))
  return await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [usage])
}

// Matches the authoritative v1 AES-256-GCM storage format: nonce || ciphertext || tag.
export const encryptPushToken = (token: string, secret: string) => Effect.tryPromise({
  try: async () => {
    if (token.trim().length === 0) throw new Error("Push token is empty")
    const key = await keyFor(secret, "encrypt")
    const nonce = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(token)))
    const sealed = new Uint8Array(nonce.length + encrypted.length)
    sealed.set(nonce)
    sealed.set(encrypted, nonce.length)
    return `v1.${encode(sealed)}`
  },
  catch: (cause) => new UpstreamUnavailable({ cause, message: "Push token encryption failed" }),
})

export const decryptPushToken = (value: string, secret: string) => Effect.tryPromise({
  try: async () => {
    if (!value.startsWith("v1.")) throw new Error("Unsupported encrypted secret format")
    const sealed = decode(value.slice(3))
    if (sealed.length <= 28) throw new Error("Encrypted secret is truncated")
    const key = await keyFor(secret, "decrypt")
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.slice(0, 12) }, key, sealed.slice(12))
    return new TextDecoder().decode(plain)
  },
  catch: (cause) => new UpstreamUnavailable({ cause, message: "Push token decryption failed" }),
})

export const hashPushToken = (token: string) => Effect.tryPromise({
  try: async () => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  catch: (cause) => new UpstreamUnavailable({ cause, message: "Push token hashing failed" }),
})
