import zstd from "../../../node_modules/@bokuweb/zstd-wasm/dist/esm/zstd.wasm"
import dictionary from "../../../internal/wararchive/war-json.zdict"
import { createArchiveDecoder } from "./war-archive-codec.js"

// CPU-only shared codec state; calls are synchronous and contain no request data
// after returning. No request-owned promises or I/O are retained across requests.
export const decodeArchiveFrame = createArchiveDecoder(zstd, new Uint8Array(dictionary))
