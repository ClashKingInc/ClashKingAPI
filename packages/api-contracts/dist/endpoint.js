import { Schema } from "effect";
export const defineEndpoint = (endpoint) => endpoint;
/** Response writers must never fabricate success for an error-only contract. */
export const requireEndpointSuccessStatus = (endpoint) => {
    if (endpoint.successStatus === null)
        throw new Error(`Endpoint ${endpoint.operationId} has no successful response`);
    return endpoint.successStatus;
};
export const NoBody = Schema.Struct({});
export const NoContent = Schema.Void;
export const NoPathParams = Schema.Struct({});
export const NoQuery = Schema.Struct({});
