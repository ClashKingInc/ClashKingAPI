import { Effect } from 'effect'
import { SqlClient } from 'effect/unstable/sql'
import { describe, expect, it, vi } from 'vitest'
import { readDashboardGatewayCollection } from './dashboard-gateway-cache.js'

describe('complete Gateway collection reads', () => {
  it.each(['members','roles','channels'] as const)('requires fresh application-scoped metadata for %s', async collection => {
    const unsafe = vi.fn(() => Effect.succeed([{items:[]}]))
    expect(await Effect.runPromise(readDashboardGatewayCollection('123','456',collection).pipe(
      Effect.provideService(SqlClient.SqlClient,{unsafe} as unknown as SqlClient.SqlClient),
    ))).toEqual([])
    const [query,params] = unsafe.mock.calls[0] as unknown as [string,unknown[]]
    expect(query).toContain(`FROM discord_cache.${collection}`)
    expect(query).toContain('guild.generation = shard.generation')
    expect(query).toContain('guild.available AND guild.metadata_complete')
    expect(query).toContain('shard.healthy AND shard.heartbeat_at')
    expect(query.includes('AND guild.members_complete')).toBe(collection === 'members')
    expect(params).toEqual(['456','123',45])
  })
  it('fails unavailable rather than treating incomplete or stale snapshots as empty', async () => {
    await expect(Effect.runPromise(readDashboardGatewayCollection('123','456','members').pipe(
      Effect.provideService(SqlClient.SqlClient,{unsafe:()=>Effect.succeed([])} as unknown as SqlClient.SqlClient),
    ))).rejects.toMatchObject({_tag:'UpstreamUnavailable'})
  })
  it('batches and deduplicates winner IDs in a single bound query', async () => {
    const unsafe = vi.fn(() => Effect.succeed([{items:[]}]))
    await Effect.runPromise(readDashboardGatewayCollection('123','456','members',['789','789','987']).pipe(
      Effect.provideService(SqlClient.SqlClient,{unsafe} as unknown as SqlClient.SqlClient),
    ))
    expect(unsafe).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('item.user_id = ANY($4::text[])'),['456','123',45,['789','987']])
  })
})
