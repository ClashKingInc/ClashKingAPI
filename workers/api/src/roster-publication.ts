export interface RosterPublicationInput {
  color?: number;
  id: string; name: string; description?: string | null; image?: string | null;
  members: readonly { townhall: number; name: string }[];
  emojis: readonly { id: string; name: string; animated?: boolean }[];
  dashboardUrl: string; joinLabel: string; leaveLabel: string; viewLabel: string; mode: string;
}
const clean = (value: string, limit: number) => value.replace(/[\\`*_~|<>[\]\r\n@]/gu, " ").slice(0, limit);

/** Up to five static messages; each embed/message stays within both 4096/6000 limits. */
export function rosterPublications(input: RosterPublicationInput) {
  const lines = input.members.map(member => {
    const emoji = input.emojis.find(e => [String(member.townhall), `th${member.townhall}`, `townhall${member.townhall}`].includes(e.name.toLowerCase().replaceAll("_", "")));
    return `${emoji ? `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>` : `🏰 ${member.townhall}`} ${clean(member.name, 25)}`;
  });
  const refreshEmoji = input.emojis.find(emoji => emoji.name.toLowerCase() === "refresh");
  const staticMode = input.mode === "static";
  const descriptions: string[] = [];
  let index = 0;
  do {
    let text = descriptions.length === 0 && input.description ? clean(input.description, 1000) + "\n\n" : "";
    const start = index;
    while (index < lines.length && (staticMode || index < 50) && text.length + lines[index]!.length + 1 <= 3800) {
      text += lines[index++]! + "\n";
    }
    if (index < lines.length && (!staticMode || descriptions.length === 4 || index === start)) {
      text += `… [${clean(input.viewLabel, 80)} ↗](${input.dashboardUrl})`;
      descriptions.push(text);
      break;
    }
    descriptions.push(text.trimEnd());
  } while (staticMode && index < lines.length && descriptions.length < 5);
  return descriptions.map((description, page) => ({
    embeds: [{ color: input.color ?? 14223113, title: clean(input.name, 100), ...(description ? { description } : {}),
      footer: { text: `👥 ${input.members.length}${descriptions.length > 1 ? ` · ${page + 1}/${descriptions.length}` : ""}` },
      ...(page === 0 && input.image ? { image: { url: input.image } } : {}) }],
    allowed_mentions: { parse: [] },
    components: [{ type: 1, components: [
      ...(!staticMode ? [{ type: 2, style: 2, ...(refreshEmoji ? { emoji: { id: refreshEmoji.id, name: refreshEmoji.name, animated: refreshEmoji.animated ?? false } } : { label: "Refresh" }), custom_id: `ck:roster:refresh:${input.id}` }] : []),
      ...(input.mode === "signup" ? [
        { type: 2, style: 3, label: input.joinLabel, custom_id: `ck:roster:join:${input.id}` },
        { type: 2, style: 4, label: input.leaveLabel, custom_id: `ck:roster:leave:${input.id}` },
      ] : []),
      { type: 2, style: 5, label: "Manage", url: input.dashboardUrl },
    ] }],
  }));
}
export function rosterPublication(input: RosterPublicationInput) {
  return rosterPublications(input)[0]!;
}
