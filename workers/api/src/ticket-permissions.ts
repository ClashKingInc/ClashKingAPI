// Discord permission bit positions, kept named so SEND_TTS_MESSAGES (12)
// cannot be mistaken for VIEW_CHANNEL (10) + SEND_MESSAGES (11).
const manageChannels=1n<<4n,addReactions=1n<<6n,viewChannel=1n<<10n,sendMessages=1n<<11n
const manageMessages=1n<<13n,embedLinks=1n<<14n,attachFiles=1n<<15n,readMessageHistory=1n<<16n
const externalEmojis=1n<<18n,useApplicationCommands=1n<<31n,sendMessagesInThreads=1n<<38n
const conversation=viewChannel|sendMessages|addReactions|attachFiles|readMessageHistory|externalEmojis
export const ticketApplicantPermissions=(conversation|embedLinks).toString()
export const ticketModeratorPermissions=(conversation|manageChannels|manageMessages|useApplicationCommands|sendMessagesInThreads).toString()
export const ticketPermissionOverwrites=(serverId:string,applicantId:string,moderatorIds:readonly string[])=>{
  if (moderatorIds.includes(serverId)) throw new Error("The everyone role cannot be ticket staff")
  return [
  {id:serverId,type:0,deny:viewChannel.toString(),allow:externalEmojis.toString()},
  {id:applicantId,type:1,deny:"0",allow:ticketApplicantPermissions},
  ...[...new Set(moderatorIds)].map(id=>({id,type:0,deny:"0",allow:ticketModeratorPermissions})),
  ]
}
