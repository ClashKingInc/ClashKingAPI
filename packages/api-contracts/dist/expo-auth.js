import { Schema } from "effect";
import { defineEndpoint, NoBody, NoContent, NoPathParams, NoQuery } from "./endpoint.js";
import { ErrorResponse } from "./errors.js";
import { JsonData } from "./expo-common.js";
export const AuthUser = Schema.Struct({
    user_id: Schema.String,
    username: Schema.String,
    avatar_url: Schema.String,
    auth_methods: Schema.Array(Schema.String),
    is_admin: Schema.optionalKey(Schema.Boolean),
});
export const CurrentUserResponse = Schema.Struct({
    ...AuthUser.fields,
    account_summary: Schema.Struct({ follower_count: Schema.Number }),
});
export const NativeAuthResponse = Schema.Struct({
    access_token: Schema.String,
    refresh_token: Schema.String,
    user: AuthUser,
});
export const WebAuthResponse = Schema.Struct({
    access_token: Schema.String,
    user: AuthUser,
});
export const NativeRefreshResponse = Schema.Struct({
    access_token: Schema.String,
    refresh_token: Schema.String,
});
export const WebRefreshResponse = Schema.Struct({ access_token: Schema.String });
export const VerificationResponse = Schema.Struct({
    message: Schema.String,
    verification_code: Schema.optionalKey(Schema.String),
});
export const ForgotPasswordResponse = Schema.Struct({
    message: Schema.String,
    reset_code: Schema.optionalKey(Schema.String),
});
export const PrivacyExportResponse = Schema.Struct({
    account: JsonData,
    player_links: Schema.Array(JsonData),
    bookmarks: Schema.Array(JsonData),
    recent_searches: Schema.Array(JsonData),
    legacy_search_settings: Schema.Array(JsonData),
    discord_sessions: Schema.Array(JsonData),
    notification_accounts: Schema.Array(JsonData),
    notification_devices: Schema.Array(JsonData),
    billing_subscription: Schema.Array(JsonData),
    subscription_entitlements: Schema.Array(JsonData),
});
export const PrivacyDeleteResponse = Schema.Struct({
    ok: Schema.Boolean,
    message: Schema.String,
    deleted: Schema.Record(Schema.String, Schema.Number),
});
const DeviceFields = { device_id: Schema.String, device_name: Schema.String };
const DiscordBody = Schema.Struct({
    code: Schema.String,
    redirect_uri: Schema.String,
    code_verifier: Schema.String,
    device_id: Schema.String,
});
const EmailBody = Schema.Struct({ email: Schema.String, password: Schema.String, ...DeviceFields });
const RegisterBody = Schema.Struct({
    email: Schema.String,
    password: Schema.String,
    username: Schema.String,
    locale: Schema.optionalKey(Schema.String),
    ...DeviceFields,
});
const VerifyEmailBody = Schema.Struct({ email: Schema.String, code: Schema.String });
const EmailOnlyBody = Schema.Struct({ email: Schema.String, locale: Schema.optionalKey(Schema.String) });
const ResetPasswordBody = Schema.Struct({
    email: Schema.String,
    reset_code: Schema.String,
    new_password: Schema.String,
    ...DeviceFields,
});
const RefreshBody = Schema.Struct({ refresh_token: Schema.String, device_id: Schema.String });
const Conflict = [{ status: 409, body: ErrorResponse }];
const NotFound = [{ status: 404, body: ErrorResponse }];
export const AuthMeEndpoint = defineEndpoint({
    operationId: "getExpoAuthMe",
    method: "GET",
    path: "/v2/auth/me",
    auth: "user",
    summary: "Get the current Expo user",
    body: NoBody,
    bodyMode: "none",
    pathParams: NoPathParams,
    query: NoQuery,
    response: CurrentUserResponse,
    responseMode: "json",
    successStatus: 200,
});
const nativeAuth = (operationId, path, body) => defineEndpoint({
    operationId,
    method: "POST",
    path,
    auth: "public",
    summary: operationId,
    body,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: NoQuery,
    response: NativeAuthResponse,
    responseMode: "json",
    successStatus: 200,
    errors: Conflict,
});
const webAuth = (operationId, path, body) => defineEndpoint({
    operationId,
    method: "POST",
    path,
    auth: "public",
    summary: operationId,
    body,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: NoQuery,
    response: WebAuthResponse,
    responseMode: "json",
    successStatus: 200,
    errors: Conflict,
});
export const AuthDiscordEndpoint = nativeAuth("expoAuthDiscord", "/v2/auth/discord", DiscordBody);
export const AuthWebDiscordEndpoint = webAuth("expoAuthWebDiscord", "/v2/auth/web/discord", DiscordBody);
export const AuthEmailEndpoint = nativeAuth("expoAuthEmail", "/v2/auth/email", EmailBody);
export const AuthWebEmailEndpoint = webAuth("expoAuthWebEmail", "/v2/auth/web/email", EmailBody);
export const AuthVerifyEmailEndpoint = nativeAuth("expoAuthVerifyEmail", "/v2/auth/verify-email-code", VerifyEmailBody);
export const AuthWebVerifyEmailEndpoint = webAuth("expoAuthWebVerifyEmail", "/v2/auth/web/verify-email-code", VerifyEmailBody);
export const AuthResetPasswordEndpoint = nativeAuth("expoAuthResetPassword", "/v2/auth/reset-password", ResetPasswordBody);
export const AuthWebResetPasswordEndpoint = webAuth("expoAuthWebResetPassword", "/v2/auth/web/reset-password", ResetPasswordBody);
export const AuthRegisterEndpoint = defineEndpoint({
    operationId: "expoAuthRegister",
    method: "POST",
    path: "/v2/auth/register",
    auth: "public",
    summary: "Register an email-backed Expo account",
    body: RegisterBody,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: NoQuery,
    response: VerificationResponse,
    responseMode: "json",
    successStatus: 200,
    errors: Conflict,
});
export const AuthResendVerificationEndpoint = defineEndpoint({
    operationId: "expoAuthResendVerification",
    method: "POST",
    path: "/v2/auth/resend-verification",
    auth: "public",
    summary: "Resend an Expo email verification",
    body: EmailOnlyBody,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: NoQuery,
    response: VerificationResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [{ status: 404, body: ErrorResponse }, { status: 410, body: ErrorResponse }],
});
export const AuthForgotPasswordEndpoint = defineEndpoint({
    operationId: "expoAuthForgotPassword",
    method: "POST",
    path: "/v2/auth/forgot-password",
    auth: "public",
    summary: "Request an Expo password reset",
    body: EmailOnlyBody,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: NoQuery,
    response: ForgotPasswordResponse,
    responseMode: "json",
    successStatus: 200,
});
export const AuthRefreshEndpoint = defineEndpoint({
    operationId: "expoAuthRefresh",
    method: "POST",
    path: "/v2/auth/refresh",
    auth: "public",
    summary: "Refresh an Expo native authentication session",
    body: RefreshBody,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: NoQuery,
    response: NativeRefreshResponse,
    responseMode: "json",
    successStatus: 200,
});
export const AuthWebRefreshEndpoint = defineEndpoint({
    operationId: "expoAuthWebRefresh",
    method: "POST",
    path: "/v2/auth/web/refresh",
    auth: "public",
    summary: "Refresh an Expo web authentication session",
    body: NoBody,
    bodyMode: "none",
    pathParams: NoPathParams,
    query: NoQuery,
    response: WebRefreshResponse,
    responseMode: "json",
    successStatus: 200,
});
export const AuthExportEndpoint = defineEndpoint({
    operationId: "getExpoPrivacyExport",
    method: "GET",
    path: "/v2/auth/export",
    auth: "user",
    summary: "Request the current user's privacy export",
    body: NoBody,
    bodyMode: "none",
    pathParams: NoPathParams,
    query: NoQuery,
    response: PrivacyExportResponse,
    responseMode: "json",
    successStatus: 200,
    errors: NotFound,
});
export const AuthDeleteEndpoint = defineEndpoint({
    operationId: "deleteExpoAuthMe",
    method: "DELETE",
    path: "/v2/auth/me",
    auth: "user",
    summary: "Delete the current Expo user",
    body: NoBody,
    bodyMode: "none",
    pathParams: NoPathParams,
    query: NoQuery,
    response: PrivacyDeleteResponse,
    responseMode: "json",
    successStatus: 200,
});
export const AuthWebLogoutEndpoint = defineEndpoint({
    operationId: "expoAuthWebLogout",
    method: "POST",
    path: "/v2/auth/web/logout",
    auth: "public",
    summary: "Clear the Expo web refresh session",
    body: NoBody,
    bodyMode: "none",
    pathParams: NoPathParams,
    query: NoQuery,
    response: NoContent,
    responseMode: "none",
    successStatus: 204,
});
