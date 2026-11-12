import { Schema } from "effect"
import { DecimalSnowflake } from "./discord.js"
import { DiscordEmbed } from "./dashboard-server.js"
import { defineEndpoint, NoQuery } from "./endpoint.js"
export const MemberPanelButton = Schema.Literals(["Link Button", "Link Help Button", "Refresh Button", "To-Do Button", "Roster Button"])
export const MemberPanelColor = Schema.Literals(["Blue", "Green", "Grey", "Red"])
export const BotMemberPanelsEndpoint = defineEndpoint({
  operationId:"botMemberPanels",method:"POST",path:"/v2/bot/servers/:serverId/member-panels",auth:"bot",
  pathParams:Schema.Struct({serverId:DecimalSnowflake}),query:NoQuery,bodyMode:"json",errors:[],
  body:Schema.Union([
    Schema.Struct({action:Schema.Literal("options"),actorId:DecimalSnowflake}),
    Schema.Struct({action:Schema.Literal("publish"),actorId:DecimalSnowflake,channelId:DecimalSnowflake,
      welcome:Schema.Boolean,buttonColor:MemberPanelColor,embedKey:Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[a-f0-9]{12}$/u))),
      buttons:Schema.Array(MemberPanelButton).check(Schema.isMinLength(1),Schema.isMaxLength(4))}),
  ]),
  response:Schema.Union([
    Schema.Struct({kind:Schema.Literal("options"),embeds:Schema.Array(Schema.Struct({name:Schema.String,key:Schema.String}))}),
    Schema.Struct({kind:Schema.Literals(["posted","welcome"]),channelId:DecimalSnowflake,messageId:Schema.optionalKey(DecimalSnowflake),
      preview:Schema.Struct({content:Schema.optionalKey(Schema.String),embeds:Schema.Array(DiscordEmbed),components:Schema.Array(Schema.JsonObject)})}),
  ]),responseMode:"json",successStatus:200,
  summary:"Create legacy member buttons or configure a welcome panel using current Dashboard Panels manage permission",
})
