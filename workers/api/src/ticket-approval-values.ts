import metadata from "./ticket-approval-static-data.json"
import staticMetadata from "./static-metadata-data.json"
import { maxLevelAtTownHall } from "./static-metadata.js"
import type { TicketApprovalToken } from "./ticket-approval-template.js"

export interface ApprovalPlayer {
  readonly name: string
  readonly townHallLevel: number
  readonly heroes: readonly { readonly name: string; readonly level: number; readonly village?: string | undefined }[]
  readonly heroEquipment: readonly { readonly name: string; readonly level: number; readonly maxLevel: number }[]
}
export interface ApprovalClan {
  readonly name: string; readonly tag: string; readonly clanLevel: number; readonly members: number;
  readonly location: { readonly name: string } | null;
  readonly warLeague: { readonly name: string } | null;
  readonly capitalLeague: { readonly name: string } | null;
  readonly memberList: readonly { readonly name: string; readonly tag: string; readonly role: string }[];
}

/** Mirrors the Bot's canonical application-emoji logical-name normalization. */
export const approvalEmojiName = (name: string): string => (name.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "")
  .replace(/[^A-Za-z0-9_]/gu, "_").replace(/_+/gu, "_").replace(/^_+|_+$/gu, "").toLowerCase() || "ck_emoji").slice(0, 32)

export const approvalHeroText = (player: ApprovalPlayer, emojis: ReadonlyMap<string, string>): string => {
  const mention = (name: string): string => emojis.get(approvalEmojiName(name)) ?? emojis.get("blank") ?? ""
  const owners: Readonly<Record<string, string>> = metadata.equipmentHeroes
  const equipment = [...player.heroEquipment].sort((left, right) => {
    const order = (name: string) => { const index = metadata.equipmentOrder.indexOf(name); return index === -1 ? 0 : index }
    return order(left.name) - order(right.name)
  })
  const heroes = new Map(player.heroes.filter(hero => hero.village === "home").map(hero => [hero.name, hero]))
  const lines: string[] = []
  for (const name of staticMetadata.roster.heroes) {
    const hero = heroes.get(name)
    if (!hero) continue
    const color = hero.level === maxLevelAtTownHall("heroes", hero.name, player.townHallLevel) ? "gold" : "blue"
    const gear = equipment.filter(item => Object.hasOwn(owners, item.name) && owners[item.name] === hero.name)
      .map(item => `${mention(item.name)}${mention(`${item.level === item.maxLevel ? "gold" : "blue"}_${item.level}`)}`).join("")
    lines.push(`${mention(hero.name)}${mention(`${color}_${hero.level}`)}${gear ? ` | ${gear}` : ""}\n`)
  }
  // The retained Python converter stringifies heros()'s None return.
  return lines.length ? lines.join("") : "None"
}

/** All values are detached read snapshots; only the saved template is parsed. */
export const approvalBuiltinValues = (input: {
  readonly ticket: { readonly number: number; readonly status: string; readonly channelId: string; readonly applicantUserId: string | null };
  readonly applicantName: string;
  readonly guild: { readonly name: string; readonly memberCount: number };
  readonly player: ApprovalPlayer | undefined;
  readonly clan: ApprovalClan | undefined;
  readonly leaderUserId: string | undefined;
  readonly emojis: ReadonlyMap<string, string>;
}): Readonly<Record<TicketApprovalToken, string>> => {
  const { ticket, player, clan } = input
  const leader = clan?.memberList.find(member => member.role === "leader")
  return {
    ticket_count: String(ticket.number), ticket_status: ticket.status,
    ticket_emoji_status: ticket.status === "open" ? "✅" : ticket.status === "sleep" ? "💤" : "❌",
    ticket_channel_mention: `<#${ticket.channelId}>`, user_name: input.applicantName,
    user_mention: ticket.applicantUserId ? `<@${ticket.applicantUserId}>` : "",
    server_name: input.guild.name, server_member_count: String(input.guild.memberCount),
    account_name: player?.name ?? "", account_th: player ? String(player.townHallLevel) : "",
    account_heroes: player ? approvalHeroText(player, input.emojis) : "",
    clan_name: clan?.name ?? "", clan_level: clan ? String(clan.clanLevel) : "",
    // create_new_badge_emoji currently returns the blank emoji; it creates nothing.
    clan_badge_emoji: clan ? input.emojis.get("blank") ?? "" : "",
    clan_link: clan ? `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${encodeURIComponent(clan.tag)}` : "",
    clan_location: clan ? clan.location?.name ?? "None" : "", clan_member_count: clan ? String(clan.members) : "",
    clan_leader: leader?.name ?? "", clan_leader_mention: clan && input.leaderUserId ? `<@${input.leaderUserId}>` : "",
    clan_tag: clan?.tag ?? "", clan_war_league: clan ? clan.warLeague?.name ?? "None" : "",
    clan_capital_league: clan ? clan.capitalLeague?.name ?? "None" : "",
  }
}
