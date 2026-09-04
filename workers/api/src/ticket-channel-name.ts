export const limitDiscordChannelName=(value:string):string=>{
  let name=""
  for (const character of value) {
    if (name.length+character.length>100) break
    name+=character
  }
  return name
}

/** Retained six-token naming contract; inserted names are never reinterpreted. */
export const ticketChannelName = (template: string, values: {
  number: number; user: string; accountName: string; accountTownhall: number | null; status: "open" | "sleep" | "closed";
}): string => {
  const replacements: Readonly<Record<string,string>> = {
    ticket_count:String(values.number),user:values.user,account_name:values.accountName,
    account_th:values.accountTownhall === null ? "" : String(values.accountTownhall),ticket_status:values.status,
    emoji_status:values.status === "open" ? "✅" : values.status === "sleep" ? "💤" : "❌",
  }
  const rendered = (template || "{ticket_count}-{user}").replaceAll(/\{(ticket_count|user|account_name|account_th|ticket_status|emoji_status)\}/gu,
    (_token,key: string)=>replacements[key]!).trim().replaceAll(/\s+/gu,"-")
  return limitDiscordChannelName(rendered) || `ticket-${values.number}`
}
