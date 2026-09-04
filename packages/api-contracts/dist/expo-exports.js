import { Schema } from "effect";
import { defineEndpoint, NoBody, NoPathParams } from "./endpoint.js";
import { ErrorResponse } from "./errors.js";
const BinaryResponse = Schema.instanceOf(Response);
export const CwlSummaryExportEndpoint = defineEndpoint({
    operationId: "downloadExpoCwlSummary",
    method: "GET",
    path: "/v2/exports/war/cwl-summary",
    auth: "public",
    summary: "Download a CWL summary workbook",
    body: NoBody,
    bodyMode: "none",
    pathParams: NoPathParams,
    query: Schema.Struct({ tag: Schema.String }),
    response: BinaryResponse,
    responseMode: "response",
    responseContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    successStatus: 200,
    errors: [
        { status: 400, body: ErrorResponse },
        { status: 404, body: ErrorResponse },
    ],
});
export const PlayerWarStatsExportEndpoint = defineEndpoint({
    operationId: "downloadExpoPlayerWarStats",
    method: "POST",
    path: "/v2/exports/war/player-stats",
    auth: "public",
    summary: "Download a player war-statistics workbook",
    body: Schema.Struct({
        player_tag: Schema.String,
        timestamp_start: Schema.optionalKey(Schema.Number),
        timestamp_end: Schema.optionalKey(Schema.Number),
        limit: Schema.optionalKey(Schema.Int),
    }),
    bodyMode: "json",
    pathParams: NoPathParams,
    query: Schema.Struct({}),
    response: BinaryResponse,
    responseMode: "response",
    responseContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    successStatus: 200,
    errors: [{ status: 400, body: ErrorResponse }, { status: 404, body: ErrorResponse }],
});
