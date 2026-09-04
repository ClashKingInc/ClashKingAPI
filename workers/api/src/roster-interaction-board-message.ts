import { DecimalSnowflake, RuntimeUUID } from "@clashking/api-contracts"
import { Schema } from "effect"

const Text = (maximum: number) => Schema.String.check(Schema.isMaxLength(maximum))
const Embed = Schema.Struct({
  title: Schema.optionalKey(Text(256)), description: Text(4096), color: Schema.Number,
  footer: Schema.optionalKey(Schema.Struct({ text: Text(500) })),
  image: Schema.optionalKey(Schema.Struct({ url: Text(2048) })),
})
const Button = Schema.Union([
  Schema.Struct({ type: Schema.Literal(2), style: Schema.Literals([1, 2, 4]), label: Text(80), custom_id: Text(100) }),
  Schema.Struct({ type: Schema.Literal(2), style: Schema.Literal(5), label: Text(80), url: Text(2048) }),
])
const Fields = {
  content: Schema.Literal(''),
  embeds: Schema.Array(Embed).check(Schema.isMinLength(1), Schema.isMaxLength(10)),
  components: Schema.Array(Schema.Struct({ type: Schema.Literal(1),
    components: Schema.Array(Button).check(Schema.isMaxLength(5)),
  })).check(Schema.isMaxLength(5)),
}
/** Local persisted delivery payload, not a public endpoint contract. */
export const RosterBoardMessageSchema = Schema.Struct({ ...Fields,
  allowed_mentions: Schema.Struct({ parse: Schema.Array(Schema.Never) }),
}).check(Schema.makeFilter(message => message.embeds.reduce((total, embed) => total + embed.description.length
  + (embed.title?.length ?? 0) + (embed.footer?.text.length ?? 0), 0) <= 6000 ? undefined : 'Board embeds exceed Discord text limits'))
export const RosterBoardObservation = Schema.Struct({ id: DecimalSnowflake, channel_id: DecimalSnowflake, ...Fields })
export const RosterBoardIntent = Schema.Struct({ publicationId: RuntimeUUID,
  snapshot: Schema.optionalKey(Schema.Struct({ revision: Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/)),
    message: RosterBoardMessageSchema,
  })),
})
