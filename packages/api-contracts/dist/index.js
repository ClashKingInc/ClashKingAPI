export * from "./app-config.js";
export * from "./admin.js";
export * from "./bot.js";
export * from "./dashboard.js";
export * from "./discord.js";
export * from "./endpoint.js";
export * from "./errors.js";
export * from "./expo.js";
export * from "./home.js";
export * from "./public-metadata.js";
export * from "./public-player-extra.js";
export * from "./current-war-summary.js";
export * from "./initialization.js";
export * from "./app-announcements.js";
export * from "./stats.js";
export * from "./tenor.js";
export * from "./billing-webhook.js";
export * from "./media.js";
import { AppConfigEndpoint } from "./app-config.js";
import { botEndpoints } from "./bot.js";
import { dashboardEndpoints } from "./dashboard.js";
import { expoEndpoints } from "./expo.js";
import { HomeActivityEndpoint } from "./home.js";
import { publicMetadataEndpoints } from "./public-metadata.js";
import { publicPlayerExtraEndpoints } from "./public-player-extra.js";
import { InitializationEndpoint } from "./initialization.js";
import { AppAnnouncementsEndpoint, AppAnnouncementCreateEndpoint, AppAnnouncementUpdateEndpoint, AppAnnouncementArchiveEndpoint } from "./app-announcements.js";
import { StatsArmiesEndpoint, StatsCwlEndpoint, StatsItemsEndpoint, StatsRankedEndpoint, StatsWarEndpoint, } from "./stats.js";
import { TenorMediaEndpoint } from "./tenor.js";
import { BillingStripeWebhookEndpoint } from "./billing-webhook.js";
import { MediaFileEndpoint, TicketMessageEventEndpoint, ticketTranscriptEndpoints } from "./media.js";
export const endpoints = {
    ...ticketTranscriptEndpoints,
    ...publicMetadataEndpoints,
    ...publicPlayerExtraEndpoints,
    initialization: InitializationEndpoint,
    appAnnouncements: AppAnnouncementsEndpoint,
    createAppAnnouncement: AppAnnouncementCreateEndpoint,
    updateAppAnnouncement: AppAnnouncementUpdateEndpoint,
    archiveAppAnnouncement: AppAnnouncementArchiveEndpoint,
    ...botEndpoints,
    ...dashboardEndpoints,
    ...expoEndpoints,
    appConfig: AppConfigEndpoint,
    homeActivity: HomeActivityEndpoint,
    statsArmies: StatsArmiesEndpoint,
    statsCwl: StatsCwlEndpoint,
    statsItems: StatsItemsEndpoint,
    statsRanked: StatsRankedEndpoint,
    statsWar: StatsWarEndpoint,
    tenorMedia: TenorMediaEndpoint,
    billingStripeWebhook: BillingStripeWebhookEndpoint,
    mediaFile: MediaFileEndpoint,
    ticketMessageEvent: TicketMessageEventEndpoint,
};
