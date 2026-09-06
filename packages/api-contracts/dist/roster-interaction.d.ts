/** @internal Deferred bot orchestration reference; never include in active API endpoint maps. */
import { Schema } from "effect";
export declare const RosterRuntimeState: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
export declare const RosterRuntimeAction: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
export declare const RosterRuntimeForm: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"account_select">;
    readonly customId: Schema.String;
    readonly content: Schema.String;
    readonly placeholder: Schema.String;
    readonly minValues: Schema.Number;
    readonly maxValues: Schema.Number;
    readonly options: Schema.$Array<Schema.Struct<{
        readonly value: Schema.String;
        readonly label: Schema.String;
    }>>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"string_select">;
    readonly customId: Schema.String;
    readonly content: Schema.String;
    readonly placeholder: Schema.String;
    readonly minValues: Schema.Literal<1>;
    readonly maxValues: Schema.Literal<1>;
    readonly options: Schema.$Array<Schema.Struct<{
        readonly value: Schema.String;
        readonly label: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
    }>>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"modal">;
    readonly customId: Schema.String;
    readonly title: Schema.String;
    readonly fields: Schema.$Array<Schema.Struct<{
        readonly customId: Schema.String;
        readonly label: Schema.String;
        readonly required: Schema.Boolean;
        readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
        readonly maxLength: Schema.Number;
    }>>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"continue">;
    readonly customId: Schema.String;
    readonly content: Schema.String;
    readonly label: Schema.String;
}>]>;
export declare const RosterActionEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly interaction: Schema.Struct<{
        readonly rawBody: Schema.String;
        readonly signature: Schema.String;
        readonly timestamp: Schema.String;
    }>;
}>, Schema.Union<readonly [Schema.Struct<{
    readonly outcome: Schema.Literal<"ready">;
    readonly operationId: Schema.String;
    readonly rosterId: Schema.String;
    readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
    readonly expiresAt: Schema.String;
    readonly form: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"account_select">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly placeholder: Schema.String;
        readonly minValues: Schema.Number;
        readonly maxValues: Schema.Number;
        readonly options: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly label: Schema.String;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"string_select">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly placeholder: Schema.String;
        readonly minValues: Schema.Literal<1>;
        readonly maxValues: Schema.Literal<1>;
        readonly options: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly label: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"modal">;
        readonly customId: Schema.String;
        readonly title: Schema.String;
        readonly fields: Schema.$Array<Schema.Struct<{
            readonly customId: Schema.String;
            readonly label: Schema.String;
            readonly required: Schema.Boolean;
            readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
            readonly maxLength: Schema.Number;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"continue">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly label: Schema.String;
    }>]>;
}>, Schema.Struct<{
    readonly outcome: Schema.Literals<readonly ["accepted", "complete"]>;
    readonly operationId: Schema.String;
    readonly rosterId: Schema.String;
    readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
    readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
    readonly statusCustomId: Schema.String;
}>]>, {
    status: number;
    body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}[]>;
export declare const RosterOperationAdvanceEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly operationId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly interaction: Schema.Struct<{
        readonly rawBody: Schema.String;
        readonly signature: Schema.String;
        readonly timestamp: Schema.String;
    }>;
}>, Schema.Union<readonly [Schema.Struct<{
    readonly outcome: Schema.Literal<"ready">;
    readonly operationId: Schema.String;
    readonly rosterId: Schema.String;
    readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
    readonly expiresAt: Schema.String;
    readonly form: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"account_select">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly placeholder: Schema.String;
        readonly minValues: Schema.Number;
        readonly maxValues: Schema.Number;
        readonly options: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly label: Schema.String;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"string_select">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly placeholder: Schema.String;
        readonly minValues: Schema.Literal<1>;
        readonly maxValues: Schema.Literal<1>;
        readonly options: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly label: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"modal">;
        readonly customId: Schema.String;
        readonly title: Schema.String;
        readonly fields: Schema.$Array<Schema.Struct<{
            readonly customId: Schema.String;
            readonly label: Schema.String;
            readonly required: Schema.Boolean;
            readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
            readonly maxLength: Schema.Number;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"continue">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly label: Schema.String;
    }>]>;
}>, Schema.Struct<{
    readonly outcome: Schema.Literals<readonly ["accepted", "complete"]>;
    readonly operationId: Schema.String;
    readonly rosterId: Schema.String;
    readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
    readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
    readonly statusCustomId: Schema.String;
}>]>, {
    status: number;
    body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}[]>;
export declare const RosterOperationStatusEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly operationId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly interaction: Schema.Struct<{
        readonly rawBody: Schema.String;
        readonly signature: Schema.String;
        readonly timestamp: Schema.String;
    }>;
}>, Schema.Struct<{
    readonly operationId: Schema.String;
    readonly rosterId: Schema.String;
    readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
    readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
    readonly channelId: Schema.optionalKey<Schema.String>;
    readonly messageId: Schema.optionalKey<Schema.String>;
    readonly failure: Schema.optionalKey<Schema.String>;
}>, {
    status: number;
    body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}[]>;
export declare const RosterPublicationPrepareEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly interaction: Schema.Struct<{
        readonly rawBody: Schema.String;
        readonly signature: Schema.String;
        readonly timestamp: Schema.String;
    }>;
}>, Schema.Union<readonly [Schema.Struct<{
    readonly outcome: Schema.Literal<"ready">;
    readonly operationId: Schema.String;
    readonly rosterId: Schema.String;
    readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
    readonly expiresAt: Schema.String;
    readonly form: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"account_select">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly placeholder: Schema.String;
        readonly minValues: Schema.Number;
        readonly maxValues: Schema.Number;
        readonly options: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly label: Schema.String;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"string_select">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly placeholder: Schema.String;
        readonly minValues: Schema.Literal<1>;
        readonly maxValues: Schema.Literal<1>;
        readonly options: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly label: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"modal">;
        readonly customId: Schema.String;
        readonly title: Schema.String;
        readonly fields: Schema.$Array<Schema.Struct<{
            readonly customId: Schema.String;
            readonly label: Schema.String;
            readonly required: Schema.Boolean;
            readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
            readonly maxLength: Schema.Number;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"continue">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly label: Schema.String;
    }>]>;
}>, Schema.Struct<{
    readonly outcome: Schema.Literals<readonly ["accepted", "complete"]>;
    readonly operationId: Schema.String;
    readonly rosterId: Schema.String;
    readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
    readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
    readonly statusCustomId: Schema.String;
}>]>, {
    status: number;
    body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}[]>;
export declare const RosterPublicationStatusEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly operationId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly interaction: Schema.Struct<{
        readonly rawBody: Schema.String;
        readonly signature: Schema.String;
        readonly timestamp: Schema.String;
    }>;
}>, Schema.Struct<{
    readonly operationId: Schema.String;
    readonly rosterId: Schema.String;
    readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
    readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
    readonly channelId: Schema.optionalKey<Schema.String>;
    readonly messageId: Schema.optionalKey<Schema.String>;
    readonly failure: Schema.optionalKey<Schema.String>;
}>, {
    status: number;
    body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}[]>;
export declare const rosterInteractionEndpoints: {
    readonly rosterAction: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly interaction: Schema.Struct<{
            readonly rawBody: Schema.String;
            readonly signature: Schema.String;
            readonly timestamp: Schema.String;
        }>;
    }>, Schema.Union<readonly [Schema.Struct<{
        readonly outcome: Schema.Literal<"ready">;
        readonly operationId: Schema.String;
        readonly rosterId: Schema.String;
        readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly expiresAt: Schema.String;
        readonly form: Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"account_select">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly placeholder: Schema.String;
            readonly minValues: Schema.Number;
            readonly maxValues: Schema.Number;
            readonly options: Schema.$Array<Schema.Struct<{
                readonly value: Schema.String;
                readonly label: Schema.String;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"string_select">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly placeholder: Schema.String;
            readonly minValues: Schema.Literal<1>;
            readonly maxValues: Schema.Literal<1>;
            readonly options: Schema.$Array<Schema.Struct<{
                readonly value: Schema.String;
                readonly label: Schema.String;
                readonly description: Schema.optionalKey<Schema.String>;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"modal">;
            readonly customId: Schema.String;
            readonly title: Schema.String;
            readonly fields: Schema.$Array<Schema.Struct<{
                readonly customId: Schema.String;
                readonly label: Schema.String;
                readonly required: Schema.Boolean;
                readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: Schema.Number;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"continue">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly label: Schema.String;
        }>]>;
    }>, Schema.Struct<{
        readonly outcome: Schema.Literals<readonly ["accepted", "complete"]>;
        readonly operationId: Schema.String;
        readonly rosterId: Schema.String;
        readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
        readonly statusCustomId: Schema.String;
    }>]>, {
        status: number;
        body: Schema.Struct<{
            readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: Schema.String;
            readonly request_id: Schema.optionalKey<Schema.String>;
            readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly field: Schema.String;
                readonly message: Schema.String;
            }>>>;
        }>;
    }[]>;
    readonly rosterOperationAdvance: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly operationId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly interaction: Schema.Struct<{
            readonly rawBody: Schema.String;
            readonly signature: Schema.String;
            readonly timestamp: Schema.String;
        }>;
    }>, Schema.Union<readonly [Schema.Struct<{
        readonly outcome: Schema.Literal<"ready">;
        readonly operationId: Schema.String;
        readonly rosterId: Schema.String;
        readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly expiresAt: Schema.String;
        readonly form: Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"account_select">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly placeholder: Schema.String;
            readonly minValues: Schema.Number;
            readonly maxValues: Schema.Number;
            readonly options: Schema.$Array<Schema.Struct<{
                readonly value: Schema.String;
                readonly label: Schema.String;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"string_select">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly placeholder: Schema.String;
            readonly minValues: Schema.Literal<1>;
            readonly maxValues: Schema.Literal<1>;
            readonly options: Schema.$Array<Schema.Struct<{
                readonly value: Schema.String;
                readonly label: Schema.String;
                readonly description: Schema.optionalKey<Schema.String>;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"modal">;
            readonly customId: Schema.String;
            readonly title: Schema.String;
            readonly fields: Schema.$Array<Schema.Struct<{
                readonly customId: Schema.String;
                readonly label: Schema.String;
                readonly required: Schema.Boolean;
                readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: Schema.Number;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"continue">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly label: Schema.String;
        }>]>;
    }>, Schema.Struct<{
        readonly outcome: Schema.Literals<readonly ["accepted", "complete"]>;
        readonly operationId: Schema.String;
        readonly rosterId: Schema.String;
        readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
        readonly statusCustomId: Schema.String;
    }>]>, {
        status: number;
        body: Schema.Struct<{
            readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: Schema.String;
            readonly request_id: Schema.optionalKey<Schema.String>;
            readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly field: Schema.String;
                readonly message: Schema.String;
            }>>>;
        }>;
    }[]>;
    readonly rosterOperationStatus: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly operationId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly interaction: Schema.Struct<{
            readonly rawBody: Schema.String;
            readonly signature: Schema.String;
            readonly timestamp: Schema.String;
        }>;
    }>, Schema.Struct<{
        readonly operationId: Schema.String;
        readonly rosterId: Schema.String;
        readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
        readonly channelId: Schema.optionalKey<Schema.String>;
        readonly messageId: Schema.optionalKey<Schema.String>;
        readonly failure: Schema.optionalKey<Schema.String>;
    }>, {
        status: number;
        body: Schema.Struct<{
            readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: Schema.String;
            readonly request_id: Schema.optionalKey<Schema.String>;
            readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly field: Schema.String;
                readonly message: Schema.String;
            }>>>;
        }>;
    }[]>;
    readonly rosterPublicationPrepare: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly interaction: Schema.Struct<{
            readonly rawBody: Schema.String;
            readonly signature: Schema.String;
            readonly timestamp: Schema.String;
        }>;
    }>, Schema.Union<readonly [Schema.Struct<{
        readonly outcome: Schema.Literal<"ready">;
        readonly operationId: Schema.String;
        readonly rosterId: Schema.String;
        readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly expiresAt: Schema.String;
        readonly form: Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"account_select">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly placeholder: Schema.String;
            readonly minValues: Schema.Number;
            readonly maxValues: Schema.Number;
            readonly options: Schema.$Array<Schema.Struct<{
                readonly value: Schema.String;
                readonly label: Schema.String;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"string_select">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly placeholder: Schema.String;
            readonly minValues: Schema.Literal<1>;
            readonly maxValues: Schema.Literal<1>;
            readonly options: Schema.$Array<Schema.Struct<{
                readonly value: Schema.String;
                readonly label: Schema.String;
                readonly description: Schema.optionalKey<Schema.String>;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"modal">;
            readonly customId: Schema.String;
            readonly title: Schema.String;
            readonly fields: Schema.$Array<Schema.Struct<{
                readonly customId: Schema.String;
                readonly label: Schema.String;
                readonly required: Schema.Boolean;
                readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: Schema.Number;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"continue">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly label: Schema.String;
        }>]>;
    }>, Schema.Struct<{
        readonly outcome: Schema.Literals<readonly ["accepted", "complete"]>;
        readonly operationId: Schema.String;
        readonly rosterId: Schema.String;
        readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
        readonly statusCustomId: Schema.String;
    }>]>, {
        status: number;
        body: Schema.Struct<{
            readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: Schema.String;
            readonly request_id: Schema.optionalKey<Schema.String>;
            readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly field: Schema.String;
                readonly message: Schema.String;
            }>>>;
        }>;
    }[]>;
    readonly rosterPublicationStatus: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly operationId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly interaction: Schema.Struct<{
            readonly rawBody: Schema.String;
            readonly signature: Schema.String;
            readonly timestamp: Schema.String;
        }>;
    }>, Schema.Struct<{
        readonly operationId: Schema.String;
        readonly rosterId: Schema.String;
        readonly action: Schema.Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
        readonly channelId: Schema.optionalKey<Schema.String>;
        readonly messageId: Schema.optionalKey<Schema.String>;
        readonly failure: Schema.optionalKey<Schema.String>;
    }>, {
        status: number;
        body: Schema.Struct<{
            readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: Schema.String;
            readonly request_id: Schema.optionalKey<Schema.String>;
            readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly field: Schema.String;
                readonly message: Schema.String;
            }>>>;
        }>;
    }[]>;
};
//# sourceMappingURL=roster-interaction.d.ts.map