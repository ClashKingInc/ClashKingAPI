import { Schema } from "effect";
export declare const SharedLinksLookupEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly discord_ids: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly player_tags: Schema.optionalKey<Schema.$Array<Schema.String>>;
}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly is_verified: Schema.Boolean;
        readonly player_tag: Schema.String;
        readonly user_id: Schema.String;
    }>>;
}>, readonly []>;
export declare const CreateServerLinkEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly playerTag: Schema.String;
    readonly userID: Schema.String;
    readonly api_token: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly player_tag: Schema.String;
    readonly user_id: Schema.String;
}>, readonly []>;
export declare const DeleteServerLinkEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly player_tag: Schema.String;
    readonly user_id: Schema.String;
}>, readonly []>;
export declare const UpdateLinkLastLoginEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly timestamp: Schema.String;
    readonly updated_count: Schema.Number;
}>, readonly []>;
export declare const RefreshVerifiedPlayerTrackingEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly player_tags: Schema.$Array<Schema.String>;
}>, Schema.Struct<{
    readonly player_tags: Schema.$Array<Schema.String>;
    readonly expires_at: Schema.String;
}>, readonly []>;
export declare const UpsertBaseVoteEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly baseId: Schema.String;
    readonly voterId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly direction: Schema.Literals<readonly ["up", "down"]>;
}>, Schema.Struct<{
    readonly baseId: Schema.String;
    readonly voterId: Schema.String;
    readonly direction: Schema.Literals<readonly ["up", "down"]>;
}>, readonly []>;
export declare const RemoveBaseVoteEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly baseId: Schema.String;
    readonly voterId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Void, readonly []>;
export declare const RecordBaseDownloadEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly baseId: Schema.String;
    readonly userId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly baseId: Schema.String;
    readonly userId: Schema.String;
    readonly downloadCount: Schema.Number;
}>, readonly []>;
export declare const botAdjacentEndpoints: {
    readonly sharedLinksLookup: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly discord_ids: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly player_tags: Schema.optionalKey<Schema.$Array<Schema.String>>;
    }>, Schema.Struct<{
        readonly items: Schema.$Array<Schema.Struct<{
            readonly is_verified: Schema.Boolean;
            readonly player_tag: Schema.String;
            readonly user_id: Schema.String;
        }>>;
    }>, readonly []>;
    readonly createServerLink: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly serverId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly userID: Schema.String;
        readonly api_token: Schema.optionalKey<Schema.String>;
    }>, Schema.Struct<{
        readonly message: Schema.String;
        readonly player_tag: Schema.String;
        readonly user_id: Schema.String;
    }>, readonly []>;
    readonly deleteServerLink: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly serverId: Schema.String;
    }>, Schema.Struct<{
        readonly playerTag: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly message: Schema.String;
        readonly player_tag: Schema.String;
        readonly user_id: Schema.String;
    }>, readonly []>;
    readonly updateLinkLastLogin: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly userId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly timestamp: Schema.String;
        readonly updated_count: Schema.Number;
    }>, readonly []>;
    readonly refreshVerifiedPlayerTracking: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly player_tags: Schema.$Array<Schema.String>;
    }>, Schema.Struct<{
        readonly player_tags: Schema.$Array<Schema.String>;
        readonly expires_at: Schema.String;
    }>, readonly []>;
    readonly upsertBaseVote: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly baseId: Schema.String;
        readonly voterId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly direction: Schema.Literals<readonly ["up", "down"]>;
    }>, Schema.Struct<{
        readonly baseId: Schema.String;
        readonly voterId: Schema.String;
        readonly direction: Schema.Literals<readonly ["up", "down"]>;
    }>, readonly []>;
    readonly removeBaseVote: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly baseId: Schema.String;
        readonly voterId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Void, readonly []>;
    readonly recordBaseDownload: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly baseId: Schema.String;
        readonly userId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly baseId: Schema.String;
        readonly userId: Schema.String;
        readonly downloadCount: Schema.Number;
    }>, readonly []>;
};
//# sourceMappingURL=bot-adjacent.d.ts.map