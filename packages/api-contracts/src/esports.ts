import { Schema } from "effect"
import { defineEndpoint, NoBody } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"

export const EsportsCcnEndpoint = defineEndpoint({
  operationId:"getEsportsCcn",method:"GET",path:"/v2/esports/ccn/:resource",auth:"public",bodyMode:"none",
  summary:"Read public Competitive Clash Network data",
  pathParams:Schema.Struct({resource:Schema.String}),body:NoBody,
  query:Schema.Struct(Object.fromEntries(["eventId","segmentId","playerTag","clanTag","teamId","search","timestamp","offset","movement"].map(key=>[key,Schema.optionalKey(Schema.String)]))),
  responseMode:"json",successStatus:200,
  response:Schema.Struct({source:Schema.Literal("ccn"),fetchedAt:Schema.String,data:Schema.Unknown}),
  errors:[{status:400,body:ErrorResponse},{status:404,body:ErrorResponse},{status:503,body:ErrorResponse}],
})
export const esportsEndpoints={esportsCcn:EsportsCcnEndpoint} as const
