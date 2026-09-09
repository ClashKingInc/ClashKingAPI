import { Context, Layer } from "effect"

// Wrangler owns resource and public-var types. Only secret-store values and
// explicitly optional deployment settings are augmented here.
interface WorkerSecrets {
  readonly API_BOT_TOKEN: string
  readonly AI_USAGE_SECRET: string
  readonly DATA_ENCRYPTION_KEY: string
  readonly DISCORD_BOT_TOKEN: string
  readonly DISCORD_CLIENT_ID: string
  readonly DISCORD_CLIENT_SECRET: string
  readonly ELASTICSEARCH_API_KEY: string
  readonly JWT_ACCESS_SECRET: string
  readonly JWT_REFRESH_SECRET: string
  readonly MOBILE_PUSH_FCM_PROJECT_ID?: string
  readonly MOBILE_PUSH_FCM_SERVICE_ACCOUNT_JSON?: string
  readonly SENTRY_DSN_MOBILE?: string
  readonly SENTRY_DSN_API?: string
  readonly SMTP_USERNAME: string
  readonly SMTP_PASSWORD: string
  readonly STRIPE_RESTRICTED_KEY: string
  readonly STRIPE_WEBHOOK_SECRET: string
}

// Retained only to type-check unmounted reference modules and their isolated
// tests. The active Wrangler configuration supplies no ticket runtime binding;
// no API dispatcher, export or scheduled handler may use this capability.
interface DeferredRuntimeReferenceBindings {
  readonly TICKET_RUNTIME: {
    getByName(name: string): { wake(operationId: string): Promise<void> }
  }
}

export type WorkerBindings = {
  readonly [Key in keyof Cloudflare.Env]: Cloudflare.Env[Key] extends string ? string : Cloudflare.Env[Key]
} & WorkerSecrets

/** Reference-only capabilities, deliberately absent from the active API environment. */
export type DeferredRuntimeBindings = WorkerBindings & DeferredRuntimeReferenceBindings

export class WorkerEnvironment extends Context.Service<
  WorkerEnvironment,
  WorkerBindings
>()("clashking/WorkerEnvironment") {
  static layer(bindings: WorkerBindings) {
    return Layer.succeed(WorkerEnvironment, bindings)
  }
}
