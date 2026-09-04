import { Schema } from "effect";
export const defineEndpoint = (endpoint) => endpoint;
export const NoBody = Schema.Struct({});
export const NoContent = Schema.Void;
export const NoPathParams = Schema.Struct({});
export const NoQuery = Schema.Struct({});
