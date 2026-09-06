# New JSON ticket transcripts in R2

This is future storage code, implemented September 4 under the user's explicit
non-HTML/R2 instruction. There are no existing R2 transcripts to inspect or
migrate. No bucket was created, no production object was read or written, and no
old transcript journal/private-viewer design was used.

## Contract and storage

`packages/api-contracts/src/ticket-transcript.ts` defines schema version 1. A
document contains the ticket context, capture start/end times, main channel and optional
thread, ordered messages, authors, plain text, structured embeds/components,
reply references, reactions and attachment references. Discord IDs stay strings.
Each channel records whether older history was excluded by the selected limit;
missing message contents are not invented. This is a capture over an interval,
not a claim that Discord provides an atomic historical snapshot.

The choice of **JSON** (rather than some other non-HTML format) is an
implementation decision. It preserves data for a future renderer/exporter
without executing ticket content. There is no HTML generation or viewer here.

Use the private `TICKETING` binding (`clashking-ticketing` proposed bucket):

1. Generate a cryptographically random UUID v4 with `createTranscriptCapability`.
2. For each attachment, call `storeTranscriptAttachment` with its UUID, size,
   SHA-256, filename, declared media type and bytes/stream. R2 verifies the hash;
   buffered lengths are checked before upload and a fixed-length stream rejects
   over/under-length uploads without committing an unusable immutable object.
3. Call `storeTicketTranscript` after collection and attachment uploads finish.
   It validates all attachment checksums/sizes, writes the JSON document, and
   creates the immutable attachment index last as the publication marker.
   Conditional writes reject different content at the same key;
   identical-byte retries return the same successful result.
4. Only then may the eventual Bot publish the returned path. Channel deletion
   requires separately confirmed collection/storage/publication in the Bot plan.

R2 keys use `transcripts/json-v1/<SHA-256-of-capability>/transcript.json`,
`index.json` and `attachments/<attachment-UUID>` beneath that prefix. There is no public bucket,
list endpoint, arbitrary key lookup, overwrite endpoint or automatic expiry.
Incomplete uploads are private orphans, never published transcripts. Cleanup
requires a separate, explicitly scoped retention decision; this code deletes
nothing.

Public reads (no login required for a person holding the link):

- `GET /v2/ticket-transcripts/:capability` returns validated JSON as a download.
- `GET /v2/ticket-transcripts/:capability/attachments/:attachmentId` streams only
  an attachment named by the immutable publication index, as a download. Uploaded media types
  cannot cause HTML/SVG execution on the API origin.

Attachment and HEAD requests read the bounded index (at most 256 KiB) and document
metadata, not the full JSON document. JSON GET additionally validates the complete
document, schema and checksum. HEAD has no response body. Invalid, unknown,
former HTML, extra-path and query-bearing URLs return 404. Corrupt/unavailable
storage returns a generic 503. JSON checksum/format/size are verified before use.
Responses have no-store, no-referrer, noindex, nosniff and restrictive sandbox/CSP
headers, and never echo request IDs or grant credentialed CORS. The entrypoint
bypasses SQL/service construction and application logging for this whole path
family; platform invocation logs/traces remain disabled to avoid recording
UUID links. Future external logging must honor the same restriction.

## Selected limits and remaining Bot work

The Bot selects the latest **2,000 messages total across the main channel and
associated thread**, and up to **100 attachments total**, as requested. The
contract rejects documents exceeding those counts rather than silently trimming
submitted data. The collector records omitted attachments per message and whether
older channel history was excluded; intentional count limits are not fetch failures.

JSON remains limited to 8 MiB, with a combined attachment-byte budget of 512 MiB.
These byte budgets are implementation-selected safety limits, not Discord limits.
The future collector must enforce the JSON byte budget incrementally during
collection; the trusted writer also preflights size before full encoding. Failed
collection or exceeded byte budgets keep the ticket intact and report the reason.
No channel deletion happens in this storage module.

The writer accepts only plain acyclic JSON, rejects executable getters/custom
serializers and caps nesting at 64 levels before recursive schema decoding.
Timestamps require an explicit timezone and a real calendar date; an impossible
date such as February 30 is not silently normalized.

The writer helpers are trusted server code, **not publicly callable upload
routes**. The full Bot plan specifies its private producer transport, permissions,
history collection, missing-attachment handling, completion notification and
delete ordering. No Bot orchestration or SQL schema was implemented here.

Tests use disposable local R2/Workerd and cover missing/invalid/HTML URLs,
checksum failure, upload-before-publication, identical/different retries,
safe attachment headers, JSON/attachment HEAD, size/incomplete rejection and
corrupt storage, stream length failures, corrected retries and malformed Unicode
filenames. The September 5 retained runtime lane passes 28 tests across eight files,
including 12 focused transcript tests. The actual API entrypoint test verifies JSON output and
quiet success/error paths without database/provider calls.

Cloudflare references: [R2 binding operations and checksum/conditional writes](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
