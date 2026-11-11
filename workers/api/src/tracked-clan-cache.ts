import { Effect } from "effect"
import { uncompress } from "snappyjs"
import type { WorkerBindings } from "./environment.js"

const encoder = new TextEncoder(), decoder = new TextDecoder()
const maxClanBytes = 2 * 1024 * 1024
const batchSize = 25
type Reply = string | Uint8Array | null | Reply[]

const command = (values: readonly string[]) => {
  const parts = [`*${values.length}\r\n`, ...values.flatMap(value => [`$${encoder.encode(value).byteLength}\r\n`, value, "\r\n"])]
  return encoder.encode(parts.join(""))
}

/** Only the bounded RESP replies needed for AUTH and MGET; values remain binary. */
class Replies {
  private buffered = new Uint8Array(0)
  private bytes = 0
  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}
  private async take(length: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(length) || length < 0 || length > maxClanBytes + 2) throw Error("Invalid cache reply size")
    while (this.buffered.byteLength < length) {
      const next = await this.reader.read()
      if (next.done) throw Error("Incomplete cache reply")
      this.bytes += next.value.byteLength
      if (this.bytes > 8 * 1024 * 1024) throw Error("Cache batch is too large")
      const joined = new Uint8Array(this.buffered.byteLength + next.value.byteLength)
      joined.set(this.buffered); joined.set(next.value, this.buffered.byteLength); this.buffered = joined
    }
    const result = this.buffered.slice(0, length)
    this.buffered = this.buffered.slice(length)
    return result
  }
  private async line(): Promise<string> {
    const bytes: number[] = []
    for (let i = 0; i < 128; i++) {
      const value = (await this.take(1))[0]!
      if (value === 13) {
        if ((await this.take(1))[0] !== 10) throw Error("Invalid cache line")
        return decoder.decode(Uint8Array.from(bytes))
      }
      bytes.push(value)
    }
    throw Error("Cache line is too long")
  }
  async read(depth = 0): Promise<Reply> {
    if (depth > 1) throw Error("Invalid cache reply nesting")
    const prefix = (await this.take(1))[0], line = await this.line()
    if (prefix === 43) return line
    if (prefix === 45) throw Error("Cache command failed")
    if (!/^-?\d+$/u.test(line)) throw Error("Invalid cache reply")
    const length = Number(line)
    if (prefix === 36) {
      if (length === -1) return null
      const value = await this.take(length + 2)
      if (value[length] !== 13 || value[length + 1] !== 10) throw Error("Invalid cache value")
      return value.slice(0, length)
    }
    if (prefix !== 42 || length < 0 || length > batchSize) throw Error("Invalid cache array")
    const values: Reply[] = []
    for (let i = 0; i < length; i++) values.push(await this.read(depth + 1))
    return values
  }
}

const readBatch = async (bindings: WorkerBindings, tags: readonly string[]) => {
  const result = new Map<string, unknown>()
  if (!bindings.CLAN_CACHE_NETWORK || !bindings.CLAN_CACHE_HOST) return result
  let socket: Awaited<ReturnType<NonNullable<WorkerBindings["CLAN_CACHE_NETWORK"]>["connect"]>> | undefined
  let expired = false
  let rejectTimeout: (cause: Error) => void = () => undefined
  const timeout = new Promise<never>((_, reject) => { rejectTimeout = reject })
  const timer = setTimeout(() => { expired = true; void socket?.close().catch(() => undefined); rejectTimeout(Error("Cache read timed out")) }, 1500)
  try {
    // Address/prefix are deployment configuration, never caller-supplied destinations.
    const pending = Promise.resolve(bindings.CLAN_CACHE_NETWORK.connect(`${bindings.CLAN_CACHE_HOST}:${bindings.CLAN_CACHE_PORT ?? "6379"}`))
    void pending.then(connected => { if (expired) void connected.close().catch(() => undefined) }, () => undefined)
    socket = await Promise.race([pending, timeout])
    if (expired) return result
    const writer = socket.writable.getWriter(), replies = new Replies(socket.readable.getReader())
    if (bindings.CLAN_CACHE_PASSWORD) {
      await writer.write(command(["AUTH", bindings.CLAN_CACHE_PASSWORD]))
      if (await replies.read() !== "OK") throw Error("Cache authentication failed")
    }
    await writer.write(command(["MGET", ...tags.map(tag => `${bindings.CLAN_CACHE_PREFIX ?? "trackedclans:snapshot:"}clan:${tag}`)]))
    writer.releaseLock()
    const values = await replies.read()
    if (!Array.isArray(values) || values.length !== tags.length) throw Error("Invalid cache result")
    for (let index = 0; index < values.length; index++) {
      const compressed = values[index]
      if (!(compressed instanceof Uint8Array)) continue
      try {
        const value: unknown = JSON.parse(decoder.decode(uncompress(compressed, maxClanBytes)))
        if (typeof value === "object" && value !== null && "tag" in value && value.tag === tags[index]
          && "memberList" in value && Array.isArray(value.memberList)) result.set(tags[index]!, value)
      } catch { /* Corrupt snapshots use the same API fallback as missing keys. */ }
    }
  } catch { /* Cache availability must not prevent the live API fallback. */ }
  finally { clearTimeout(timer); await socket?.close().catch(() => undefined) }
  return result
}

/** Tracking owns these Snappy snapshots. Never overwrite them or cache API fallbacks. */
export const readTrackedClans = (bindings: WorkerBindings, tags: readonly string[]) => {
  const batches: string[][] = []
  for (let offset = 0; offset < tags.length; offset += batchSize) batches.push(tags.slice(offset, offset + batchSize))
  return Effect.forEach(batches, batch => Effect.promise(() => readBatch(bindings, batch)), { concurrency: 3 })
    .pipe(Effect.map(results => new Map(results.flatMap(result => [...result]))))
}
