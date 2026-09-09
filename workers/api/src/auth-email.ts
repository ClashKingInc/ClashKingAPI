import type { expoEndpoints } from "@clashking/api-contracts"
import emailAddresses from "email-addresses"
import { Context, Data, Effect, Layer } from "effect"
import { SqlClient, SqlError } from "effect/unstable/sql"
import { AuthCrypto, type SessionKind } from "./auth-crypto.js"
import { AuthSessions, emailAuthUser, requireSessionDevice, type AuthSession, type EmailAccount } from "./auth-sessions.js"
import { Conflict, DatabaseFailure, InvalidRequest, NotFound, Unauthenticated, UpstreamUnavailable, type ApiFailure } from "./errors.js"

export interface AuthEmailMessage {
  readonly kind: "verification" | "password_reset"
  readonly recipient: string
  readonly username: string
  readonly code: string
  readonly locale: string
}
export class AuthMailer extends Context.Service<AuthMailer, {
  readonly send: (message: AuthEmailMessage) => Effect.Effect<void, UpstreamUnavailable>
}>()("clashking/AuthMailer") {}
export class AuthVerificationExpired extends Data.TaggedError("AuthVerificationExpired")<{ readonly message: string }> {}
export interface AuthLocaleHints {
  readonly explicit?: string | undefined
  readonly query?: string | undefined
  readonly header?: string | undefined
  readonly acceptLanguage?: string | undefined
}
type RegisterInput = typeof expoEndpoints.authRegister.body.Type
type ResetInput = typeof expoEndpoints.authResetPassword.body.Type
type MessageResponse = { readonly message: string }
interface Pending { readonly username: string; readonly password_hash: string; readonly device_id: string; readonly expires_at: Date }
const sent = { message: "Verification email sent. Please check your email and enter the 6-digit code." }
const resent = { message: "Verification email resent successfully. Please check your email." }
const resetSent = { message: "If an account exists for this email, a password reset code has been sent." }
const pendingConflict = () => new Conflict({ message: "A verification email was already sent to this address. Please check your email or request a resend." })

export class AuthEmail extends Context.Service<AuthEmail, {
  readonly register: (input: RegisterInput, locale: string) => Effect.Effect<MessageResponse, ApiFailure>
  readonly resend: (email: string, locale: string) => Effect.Effect<MessageResponse, ApiFailure | AuthVerificationExpired>
  readonly verify: (email: string, code: string, kind: SessionKind) => Effect.Effect<AuthSession, ApiFailure>
  readonly forgot: (email: string, locale: AuthLocaleHints) => Effect.Effect<MessageResponse, ApiFailure>
  readonly reset: (input: ResetInput, kind: SessionKind) => Effect.Effect<AuthSession, ApiFailure>
}>()("clashking/AuthEmail") {
  static readonly layer = Layer.effect(AuthEmail, Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const auth = yield* AuthCrypto
    const sessions = yield* AuthSessions
    const mailer = yield* AuthMailer
    const account = (hash: string) => database(sql<EmailAccount>`SELECT user_id,username,password_hash FROM auth_users WHERE email_hash = ${hash} AND provider = 'email'`)
    const newCode = (emailHash: string) => Effect.gen(function* () {
      const code = yield* auth.verificationCode()
      return { code, codeHash: yield* auth.codeHash(emailHash, code) }
    })
    return AuthEmail.of({
      register: (input, locale) => Effect.gen(function* () {
        yield* validateEmail(input.email)
        const usernameLength = new TextEncoder().encode(input.username).length
        if (usernameLength < 3 || usernameLength > 30) return yield* new InvalidRequest({ message: "Username must be between 3 and 30 UTF-8 bytes" })
        const emailHash = yield* auth.emailHash(input.email)
        if ((yield* account(emailHash)).length !== 0) return yield* new InvalidRequest({ message: "Email already registered. Please try logging in instead." })
        const passwordHash = yield* auth.passwordHash(input.password)
        const { code, codeHash } = yield* newCode(emailHash)
        // Conditional upsert makes concurrent registrations one winner without
        // overwriting a live pending code/password/device from another request.
        const rows = yield* database(sql<{ email_hash: string }>`INSERT INTO auth_email_verifications
          (email_hash,verification_code_hash,username,password_hash,device_id,expires_at)
          VALUES (${emailHash},${codeHash},${input.username},${passwordHash},${input.device_id},now() + interval '15 minutes')
          ON CONFLICT (email_hash) DO UPDATE SET verification_code_hash = EXCLUDED.verification_code_hash,
            username = EXCLUDED.username,password_hash = EXCLUDED.password_hash,device_id = EXCLUDED.device_id,
            expires_at = EXCLUDED.expires_at,created_at = now()
          WHERE auth_email_verifications.expires_at <= now() RETURNING email_hash`)
        if (rows.length === 0) return yield* pendingConflict()
        yield* mailer.send({ kind: "verification", recipient: input.email.trim(), username: input.username, code, locale }).pipe(
          Effect.catch(() => Effect.gen(function* () {
            yield* database(sql`DELETE FROM auth_email_verifications WHERE email_hash = ${emailHash} AND verification_code_hash = ${codeHash}`)
            return yield* new UpstreamUnavailable({ cause: "Verification delivery failed", message: "Verification email could not be sent. Please try again." })
          })),
        )
        return sent
      }),
      resend: (email, locale) => Effect.gen(function* () {
        yield* validateEmail(email)
        const emailHash = yield* auth.emailHash(email)
        const { code, codeHash } = yield* newCode(emailHash)
        const pending = yield* sql.withTransaction(Effect.gen(function* () {
          const rows = yield* database(sql<Pending>`SELECT username,password_hash,device_id,expires_at
            FROM auth_email_verifications WHERE email_hash = ${emailHash} FOR UPDATE`)
          const record = rows[0]
          if (record === undefined) {
            if ((yield* account(emailHash)).length !== 0) return yield* new InvalidRequest({ message: "This email is already verified. Please try logging in instead." })
            return yield* new NotFound({ message: "No pending verification found for this email. Please register first." })
          }
          if (new Date(record.expires_at).valueOf() <= Date.now()) {
            yield* database(sql`DELETE FROM auth_email_verifications WHERE email_hash = ${emailHash}`)
            return undefined
          }
          yield* database(sql`UPDATE auth_email_verifications SET verification_code_hash = ${codeHash},
            expires_at = now() + interval '15 minutes',created_at = now() WHERE email_hash = ${emailHash}`)
          return record
        })).pipe(mapTransactionError)
        if (pending === undefined) return yield* new AuthVerificationExpired({ message: "Verification expired. Please register again." })
        yield* mailer.send({ kind: "verification", recipient: email.trim(), username: pending.username, code, locale })
        return resent
      }),
      verify: (email, code, kind) => Effect.gen(function* () {
        if (!email.trim() || (kind === "web" ? code.trim() : code).length !== 6) return yield* new InvalidRequest({ message: "Email and a valid verification code are required" })
        const emailHash = yield* auth.emailHash(email)
        const codeHash = yield* auth.codeHash(emailHash, code)
        return yield* sql.withTransaction(Effect.gen(function* () {
          const rows = yield* database(sql<Pending>`DELETE FROM auth_email_verifications
            WHERE email_hash = ${emailHash} AND verification_code_hash = ${codeHash} AND expires_at > now()
            RETURNING username,password_hash,device_id,expires_at`)
          const pending = rows[0]
          if (pending === undefined) return yield* new Unauthenticated({ message: "Invalid or expired verification code" })
          yield* requireSessionDevice(pending.device_id, kind)
          const users = yield* database(sql<EmailAccount>`INSERT INTO auth_users (user_id,provider,email_hash,username,password_hash)
            VALUES (${crypto.randomUUID()},'email',${emailHash},${pending.username},${pending.password_hash})
            ON CONFLICT (email_hash) DO NOTHING RETURNING user_id,username,password_hash`)
          const user = users[0]
          // Email verification is not password recovery. An old pending record
          // must never replace credentials on an already-created account.
          if (user === undefined) return yield* new Conflict({ message: "Email is already verified. Please log in or reset your password." })
          return { ...yield* sessions.issue(user.user_id, pending.device_id, kind), user: emailAuthUser(user) }
        })).pipe(mapTransactionError)
      }),
      forgot: (email, hints) => Effect.gen(function* () {
        yield* validateEmail(email)
        const emailHash = yield* auth.emailHash(email)
        // Existing Go hides account presence and mail/storage failures here.
        const result = yield* Effect.gen(function* () {
          const user = (yield* account(emailHash))[0]
          if (user === undefined) return resetSent
          const { code, codeHash } = yield* newCode(emailHash)
          yield* database(sql`INSERT INTO auth_password_reset_tokens (email_hash,reset_code_hash,user_id,expires_at)
            VALUES (${emailHash},${codeHash},${user.user_id},now() + interval '1 hour')
            ON CONFLICT (email_hash) DO UPDATE SET reset_code_hash = EXCLUDED.reset_code_hash,user_id = EXCLUDED.user_id,
              expires_at = EXCLUDED.expires_at,created_at = now()`)
          const stored = yield* database(sql<{ locale: string }>`SELECT locale FROM mobile_push_devices
            WHERE user_id = ${user.user_id} AND locale IS NOT NULL AND locale <> '' ORDER BY last_seen_at DESC LIMIT 1`)
            .pipe(Effect.catch(() => Effect.succeed([])))
          yield* mailer.send({ kind: "password_reset", recipient: email.trim(), username: emailAuthUser(user).username, code,
            locale: requestedAuthLocale(hints, stored[0]?.locale ?? ""),
          }).pipe(Effect.catch(() => Effect.gen(function* () {
            yield* database(sql`DELETE FROM auth_password_reset_tokens WHERE email_hash = ${emailHash} AND reset_code_hash = ${codeHash}`)
          })))
          return resetSent
        }).pipe(Effect.catch(() => Effect.succeed(resetSent)))
        return result
      }),
      reset: (input, kind) => Effect.gen(function* () {
        yield* validateEmail(input.email)
        yield* requireSessionDevice(input.device_id, kind)
        if (input.reset_code.length !== 6) return yield* new InvalidRequest({ message: "Invalid password reset code format" })
        const passwordHash = yield* auth.passwordHash(input.new_password)
        const emailHash = yield* auth.emailHash(input.email)
        const codeHash = yield* auth.codeHash(emailHash, input.reset_code)
        return yield* sql.withTransaction(Effect.gen(function* () {
          // All issuance/rotation uses this same user row lock before changing
          // refresh rows, so a concurrent successor cannot escape revocation.
          const users = yield* database(sql<EmailAccount>`SELECT /* auth-reset-lock */ user_id,username,password_hash FROM auth_users
            WHERE email_hash = ${emailHash} AND provider = 'email' FOR UPDATE`)
          const user = users[0]
          if (user === undefined) return yield* new Unauthenticated({ message: "Invalid or expired password reset code." })
          const consumed = yield* database(sql<{ user_id: string }>`DELETE FROM auth_password_reset_tokens
            WHERE email_hash = ${emailHash} AND user_id = ${user.user_id} AND reset_code_hash = ${codeHash}
              AND expires_at > now() RETURNING user_id`)
          if (consumed.length !== 1) return yield* new Unauthenticated({ message: "Invalid or expired password reset code." })
          yield* database(sql`UPDATE auth_users SET password_hash = ${passwordHash},updated_at = now() WHERE user_id = ${user.user_id}`)
          yield* database(sql`DELETE FROM auth_refresh_tokens WHERE user_id = ${user.user_id}`)
          return { ...yield* sessions.issue(user.user_id, input.device_id, kind), user: emailAuthUser(user) }
        })).pipe(mapTransactionError)
      }),
    })
  }))
}

export function validateEmail(email: string) {
  return Effect.try({
    try: () => {
      if (!email.trim()) throw new Error("Email is required")
      const parsed = emailAddresses.parseOneAddress({ input: email, rfc6532: true })
      const mailbox = parsed?.type === "group" && parsed.addresses.length === 1 ? parsed.addresses[0] : parsed
      if (mailbox === null || mailbox === undefined || mailbox.type !== "mailbox" || /[\r\n\0]/u.test(email)) throw new Error("Invalid email format")
      // Go net/mail does not accept CFWS between the local part and '@'.
      // Keep quoted local parts and single-member groups that Go does accept.
      const rawLocal = mailbox.parts.local.tokens.trimStart()
      if (!/^(?:"(?:[^"\\\r\n]|\\.)+"|[^\s()<>[\]:;@\\,"]+)$/u.test(rawLocal)) throw new Error("Invalid email format")
      return mailbox
    },
    catch: () => new InvalidRequest({ message: email.trim() ? "Invalid email format" : "Email is required" }),
  })
}

export function requestedAuthLocale(hints: AuthLocaleHints, stored = ""): string {
  for (const candidate of [hints.explicit, hints.query, hints.header, stored, hints.acceptLanguage]) {
    const value = candidate?.split(",")[0]?.split(";")[0]?.trim()
    if (value) return value
  }
  return "en"
}

function database<A, E>(operation: Effect.Effect<A, E>) {
  return operation.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Email authentication storage failed" })))
}
function mapTransactionError<A, E extends ApiFailure | AuthVerificationExpired, R>(operation: Effect.Effect<A, E | SqlError.SqlError, R>) {
  return operation.pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(new DatabaseFailure({ cause, message: "Email authentication transaction failed" }))))
}
