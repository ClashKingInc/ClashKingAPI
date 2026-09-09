import { Schema } from "effect"
import { expect, it } from "vitest"
import { RosterBoardMessageSchema, RosterBoardObservation } from "./roster-interaction-board-message.js"

it('normalizes Discord metadata and JSONB key order before comparing delivered board observations', () => {
  const base = { content: '', embeds: [{ title: 'Roster', description: 'Members', color: 0x2b2d31,
    footer: { text: 'Showing 0 of 0 members.' } }], components: [], allowed_mentions: { parse: [] } }
  const message = Schema.decodeUnknownSync(RosterBoardMessageSchema)(base)
  const expected = Schema.decodeUnknownSync(RosterBoardObservation)({ id: '123456789012345678', channel_id: '223456789012345678', ...message })
  const observed = Schema.decodeUnknownSync(RosterBoardObservation)({ components: [], content: '',
    channel_id: '223456789012345678', id: '123456789012345678', author: { bot: true },
    embeds: [{ type: 'rich', footer: { proxy_icon_url: 'ignored', text: 'Showing 0 of 0 members.' },
      color: 0x2b2d31, description: 'Members', title: 'Roster' }],
  })
  expect(JSON.stringify(observed)).toBe(JSON.stringify(expected))
})

it('rejects mentions and combined embed overflow in a persisted board message', () => {
  const decode = Schema.decodeUnknownSync(RosterBoardMessageSchema)
  const message = { content: '', components: [], allowed_mentions: { parse: [] },
    embeds: [{ description: 'A'.repeat(3500), color: 0 }, { description: 'B'.repeat(3500), color: 0 }] }
  expect(() => decode(message)).toThrow()
  expect(() => decode({ ...message, embeds: [{ description: 'Roster', color: 0 }], allowed_mentions: { parse: ['everyone'] } })).toThrow()
})
