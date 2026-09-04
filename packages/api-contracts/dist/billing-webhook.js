import { Schema } from "effect";
import { defineEndpoint, NoContent, NoPathParams, NoQuery } from "./endpoint.js";
import { ErrorResponse } from "./errors.js";
/** Preserve the original bytes; verification happens before JSON decoding. */
export const BillingStripeWebhookEndpoint = defineEndpoint({
    operationId: "billingStripeWebhook", method: "POST", path: "/v2/billing/stripe/webhook", auth: "public",
    body: Schema.String, bodyMode: "text", pathParams: NoPathParams, query: NoQuery,
    response: NoContent, responseMode: "none", successStatus: 200,
    summary: "Process an independently verified Stripe webhook",
    errors: [400, 401, 413, 503].map((status) => ({ status, body: ErrorResponse })),
});
