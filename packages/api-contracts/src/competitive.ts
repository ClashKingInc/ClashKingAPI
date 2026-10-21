import { Schema } from "effect"
import { defineEndpoint,NoBody,NoQuery,type AuthMode,type ContractSchema,type HttpMethod } from "./endpoint.js"

export const CompetitiveSize=Schema.Literals([2,3,5,10])
export const CompetitiveFormat=Schema.Literals(["single_elimination","double_elimination","round_robin","swiss","elo"])
export const CompetitiveRules=Schema.Struct({description:Schema.String,minTownHall:Schema.Int,maxTownHall:Schema.Int,maxRosterSize:CompetitiveSize,prizeDescription:Schema.optionalKey(Schema.String.check(Schema.isMaxLength(1000)).annotate({description:'Informational prizes only; no entry fees or payment processing. Empty string clears.'})),rulebookUrl:Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2048),Schema.isPattern(/^(?:https:\/\/|$)/u)).annotate({description:'Absolute HTTPS rulebook URL without embedded credentials. Empty string clears.'})),visibility:Schema.optionalKey(Schema.Literals(['public','unlisted']).annotate({description:'Public is discoverable. Unlisted is accessible by direct link, by the participant owner and in server administration.'}))})
export const CompetitiveTournament=Schema.Struct({id:Schema.String,serverId:Schema.String,name:Schema.String,format:CompetitiveFormat,teamSize:CompetitiveSize,startsAt:Schema.String,endsAt:Schema.String,status:Schema.Literals(["draft","registration","active","completed","cancelled"]),rules:CompetitiveRules})
export const CompetitiveProfileWrite=Schema.Struct({displayName:Schema.optionalKey(Schema.String),avatarUrl:Schema.optionalKey(Schema.NullOr(Schema.String)),bannerUrl:Schema.optionalKey(Schema.NullOr(Schema.String)),private:Schema.Boolean,hideDiscord:Schema.optionalKey(Schema.Boolean),bio:Schema.optionalKey(Schema.String),socials:Schema.optionalKey(Schema.Record(Schema.String,Schema.String))})
export const CompetitiveMember=Schema.Struct({playerTag:Schema.String,name:Schema.String,joinedAt:Schema.String,acceptedAt:Schema.NullOr(Schema.String),profile:Schema.NullOr(Schema.Struct({userId:Schema.String,displayName:Schema.String,avatarUrl:Schema.NullOr(Schema.String)}))})
export const CompetitiveTeam=Schema.Struct({id:Schema.String,clanTag:Schema.String,clanName:Schema.String,size:CompetitiveSize,archived:Schema.Boolean,members:Schema.Array(CompetitiveMember),internalName:Schema.optionalKey(Schema.String),serverId:Schema.optionalKey(Schema.String)})
const optional=Schema.optionalKey
const TournamentWrite=Schema.Struct({name:Schema.String,format:CompetitiveFormat,teamSize:CompetitiveSize,startsAt:Schema.String,endsAt:Schema.String,rules:optional(CompetitiveRules)})
const TournamentUpdate=Schema.Struct({name:optional(Schema.String),format:optional(CompetitiveFormat),teamSize:optional(CompetitiveSize),startsAt:optional(Schema.String),endsAt:optional(Schema.String),rules:optional(CompetitiveRules),status:optional(Schema.Literals(["draft","registration","active","completed","cancelled"]))})
const endpoint=(operationId:string,method:HttpMethod,path:`/${string}`,auth:AuthMode,body:ContractSchema=NoBody,response:ContractSchema=Schema.Unknown,query:ContractSchema=NoQuery)=>defineEndpoint({operationId,method,path,auth,body,bodyMode:body===NoBody?"none":"json",pathParams:Schema.Struct(Object.fromEntries([...path.matchAll(/:(\w+)/gu)].map(match=>[match[1]!,Schema.String]))),query,response,responseMode:"json",successStatus:200,summary:operationId.replace(/([A-Z])/gu,' $1').trim(),errors:[]})
const server="/v2/competitive/servers/:serverId" as const
export const competitiveEndpoints={
 competitiveTournaments:endpoint("competitiveTournaments","GET","/v2/competitive/tournaments","public",NoBody,Schema.Struct({items:Schema.Array(CompetitiveTournament)})),
 competitiveTournament:endpoint("competitiveTournament","GET","/v2/competitive/tournaments/:id","public"),
 competitiveClanTeams:endpoint("competitiveClanTeams","GET","/v2/competitive/clans/:clanTag/teams","public",NoBody,Schema.Struct({items:Schema.Array(CompetitiveTeam)})),
 competitiveTeam:endpoint("competitiveTeam","GET","/v2/competitive/teams/:id","public"),
 competitiveAttacks:endpoint("competitiveAttacks","GET","/v2/competitive/matches/:id/attacks","public"),
 competitiveProfile:endpoint("competitiveProfile","GET","/v2/competitive/profile","user"),
 competitiveProfileUpdate:endpoint("competitiveProfileUpdate","PUT","/v2/competitive/profile","user",CompetitiveProfileWrite),
 competitivePublicProfile:endpoint("competitivePublicProfile","GET","/v2/competitive/profiles/:userId","public"),
 competitiveJoin:endpoint("competitiveJoin","POST","/v2/competitive/teams/:id/join","user",Schema.Struct({playerTag:Schema.String})),
 competitiveLeave:endpoint("competitiveLeave","POST","/v2/competitive/teams/:id/leave","user",Schema.Struct({playerTag:Schema.String})),
 competitiveRegister:endpoint("competitiveRegister","POST","/v2/competitive/tournaments/:id/register","user",Schema.Struct({teamId:Schema.String})),
 competitiveCheckIn:endpoint("competitiveCheckIn","POST","/v2/competitive/tournaments/:id/check-in","user",Schema.Struct({teamId:Schema.String})),
 competitiveOverview:endpoint("competitiveOverview","GET",`${server}/overview`,"server-read"),
 competitiveServerTeams:endpoint("competitiveServerTeams","GET",`${server}/teams`,"server-read"),
 competitiveCreateTeam:endpoint("competitiveCreateTeam","POST",`${server}/teams`,"server-write",Schema.Struct({clanTag:Schema.String,internalName:Schema.String,size:CompetitiveSize})),
 competitiveUpdateTeam:endpoint("competitiveUpdateTeam","PUT",`${server}/teams/:id`,"server-write",Schema.Struct({internalName:optional(Schema.String),archived:optional(Schema.Boolean)})),
 competitiveInvite:endpoint("competitiveInvite","POST",`${server}/teams/:id/members`,"server-write",Schema.Struct({playerTag:Schema.String})),
 competitiveRemoveMember:endpoint("competitiveRemoveMember","DELETE",`${server}/teams/:id/members/:playerTag`,"server-write"),
 competitiveServerTournaments:endpoint("competitiveServerTournaments","GET",`${server}/tournaments`,"server-read"),
 competitiveServerTournament:endpoint("competitiveServerTournament","GET",`${server}/tournaments/:id`,"server-read"),
 competitiveCreateTournament:endpoint("competitiveCreateTournament","POST",`${server}/tournaments`,"server-write",TournamentWrite),
 competitiveUpdateTournament:endpoint("competitiveUpdateTournament","PUT",`${server}/tournaments/:id`,"server-write",TournamentUpdate),
 competitiveAddParticipant:endpoint("competitiveAddParticipant","POST",`${server}/tournaments/:id/participants`,"server-write",Schema.Struct({teamId:Schema.String})),
 competitiveRemoveParticipant:endpoint("competitiveRemoveParticipant","DELETE",`${server}/tournaments/:id/participants/:teamId`,"server-write"),
 competitiveGenerate:endpoint("competitiveGenerate","POST",`${server}/tournaments/:id/generate`,"server-write",Schema.Struct({})),
 competitiveSync:endpoint("competitiveSync","POST",`${server}/tournaments/:id/sync`,"server-write",Schema.Struct({})),
 competitiveCreateMatch:endpoint("competitiveCreateMatch","POST",`${server}/tournaments/:id/matches`,"server-write",Schema.Struct({homeTeamId:Schema.String,awayTeamId:Schema.String,round:Schema.Int,warId:optional(Schema.String)})),
 competitiveScore:endpoint("competitiveScore","PUT",`${server}/matches/:id`,"server-write",Schema.Struct({homeScore:Schema.Number,awayScore:Schema.Number,status:Schema.Literals(["scheduled","active","completed","cancelled"]),reason:Schema.String,penalty:optional(Schema.Struct({homeDeduction:Schema.Number,awayDeduction:Schema.Number,reason:Schema.String}))})),
 competitiveServerAttacks:endpoint("competitiveServerAttacks","GET",`${server}/matches/:id/attacks`,"server-read"),
 competitivePermissions:endpoint("competitivePermissions","GET",`${server}/permissions`,"server-read"),
 competitiveUpdatePermissions:endpoint("competitiveUpdatePermissions","PUT",`${server}/permissions`,"server-write",Schema.Struct({items:Schema.Array(Schema.Struct({roleId:Schema.String,permission:Schema.Literals(["teams","tournaments","participants","matches","scores","penalties","permissions"])}))})),
 competitiveAudit:endpoint("competitiveAudit","GET",`${server}/audit`,"server-read"),
 competitiveCcn:endpoint("competitiveCcn","GET","/v2/esports/ccn/:resource","public",NoBody,Schema.Struct({source:Schema.Literal("ccn"),fetchedAt:Schema.String,data:Schema.Unknown}),Schema.Struct({eventId:optional(Schema.String),segmentId:optional(Schema.String),playerTag:optional(Schema.String),clanTag:optional(Schema.String),teamId:optional(Schema.String),search:optional(Schema.String),timestamp:optional(Schema.String),offset:optional(Schema.String)})),
 competitiveProfileImage:{...endpoint("competitiveProfileImage","POST","/v2/competitive/profile/image","user",Schema.Unknown),bodyMode:"multipart" as const},
} as const
