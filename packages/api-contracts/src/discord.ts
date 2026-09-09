import { Schema } from "effect"

/** A Discord snowflake transported losslessly as an unsigned decimal string. */
export const DecimalSnowflake = Schema.String.check(
  Schema.isPattern(/^\d{1,20}$/u, {
    description: "Discord snowflake as an unsigned decimal string",
  }),
)

