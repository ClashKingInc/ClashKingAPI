import { Schema } from "effect"
import { defineEndpoint } from "./endpoint.js"
export const BotWarStatisticsEndpoint=defineEndpoint({
 auth:"bot",method:"POST",path:"/v2/bot/war-statistics",operationId:"botWarStatistics",pathParams:Schema.Struct({}),query:Schema.Struct({}),bodyMode:"json",
 body:Schema.Struct({clans:Schema.Array(Schema.String),view:Schema.optionalKey(Schema.Literals(["attack","defense"])),warTypes:Schema.optionalKey(Schema.Array(Schema.Literals(["random","cwl","friendly"]))),stars:Schema.optionalKey(Schema.Array(Schema.Number)),thFilter:Schema.optionalKey(Schema.String),season:Schema.optionalKey(Schema.String),days:Schema.optionalKey(Schema.Number),warCount:Schema.optionalKey(Schema.Number)}),
 response:Schema.Struct({start:Schema.String,end:Schema.String,season:Schema.NullOr(Schema.String),selectedWars:Schema.Number,loadedWars:Schema.Number,truncated:Schema.Boolean,complete:Schema.Boolean,items:Schema.Array(Schema.Struct({tag:Schema.String,name:Schema.String,townhall:Schema.Number,attempts:Schema.Number,matching:Schema.Number,stars:Schema.Number,destruction:Schema.Number}))}),responseMode:"json",successStatus:200,
 summary:"Aggregate recorded completed wars for selected clans; incomplete archive coverage returns no ranking.",
})
