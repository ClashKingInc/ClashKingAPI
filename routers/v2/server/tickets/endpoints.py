from datetime import datetime, timezone
from html import escape

import aiohttp
import linkd
import hikari
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from utils.database import MongoClient
from utils.security import check_authentication
from utils.utils import upload_html_to_cdn

from .models import (
    ApproveMessage,
    MessageResponse,
    OpenTicket,
    OpenTicketsResponse,
    ServerEmbed,
    ServerEmbedsResponse,
    TicketButton,
    TicketButtonSettings,
    TicketPanel,
    TicketPanelsResponse,
    UpdateOpenTicketClanRequest,
    UpdateOpenTicketStatusRequest,
    UpdateApproveMessagesRequest,
    UpdateButtonSettingsRequest,
    UpdateTicketPanelRequest,
    UpsertEmbedRequest,
)
from utils.config import Config
from utils.custom_coc import CustomClashClient

security = HTTPBearer()
router = APIRouter(prefix="/v2/server", tags=["Server Tickets"], include_in_schema=True)
config = Config()


def _str_or_none(value) -> str | None:
    return str(value) if value is not None else None


def _snowflake_variants(value: str | int) -> list[str | int]:
    variants: list[str | int] = [str(value)]
    try:
        variants.append(int(value))
    except (TypeError, ValueError):
        pass
    return variants


def _ticket_channel_query(server_id: int, channel_id: str | int) -> dict:
    return {
        "channel": {"$in": _snowflake_variants(channel_id)},
        "server": {"$in": _snowflake_variants(server_id)},
    }


async def _discord_request(method: str, endpoint: str, *, json_body: dict | None = None) -> None:
    url = f"https://discord.com/api/v10{endpoint}"
    headers = {
        "Authorization": f"Bot {config.bot_token}",
        "Content-Type": "application/json",
    }
    async with aiohttp.ClientSession() as session:
        async with session.request(method, url, headers=headers, json=json_body) as response:
            if response.status in {200, 201, 204}:
                if response.status == 204:
                    return None
                content_type = response.headers.get("Content-Type", "")
                if "application/json" in content_type:
                    return await response.json()
                return await response.text()
            detail = await response.text()
            if response.status == 403:
                raise HTTPException(status_code=403, detail="Bot lacks permissions to manage this ticket channel")
            if response.status == 404:
                raise HTTPException(status_code=404, detail="Ticket channel not found on Discord")
            raise HTTPException(status_code=502, detail=f"Discord API error: {detail}")


def _discord_snowflake_to_datetime(snowflake: int | str) -> datetime:
    snowflake_int = int(snowflake)
    timestamp_ms = (snowflake_int >> 22) + 1420070400000
    return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)


def _discord_timestamp(value: datetime) -> str:
    return f"<t:{int(value.timestamp())}:f>"


async def _fetch_discord_user(user_id: str | int) -> dict:
    try:
        user = await _discord_request("GET", f"/users/{int(user_id)}")
        if isinstance(user, dict):
            return user
    except HTTPException:
        pass
    return {"id": str(user_id), "username": f"User {user_id}"}


async def _fetch_discord_channel(channel_id: str | int) -> dict | None:
    try:
        channel = await _discord_request("GET", f"/channels/{int(channel_id)}")
        if isinstance(channel, dict):
            return channel
    except HTTPException:
        return None
    return None


async def _fetch_discord_member(server_id: int, user_id: str | int) -> dict | None:
    try:
        member = await _discord_request("GET", f"/guilds/{server_id}/members/{int(user_id)}")
        if isinstance(member, dict):
            return member
    except HTTPException:
        return None
    return None


def _member_avatar_url(member: dict | None) -> str | None:
    if not member:
        return None
    user = member.get("user") or {}
    guild_avatar = member.get("avatar")
    if guild_avatar:
        return f"https://cdn.discordapp.com/guilds/{member.get('guild_id')}/users/{user.get('id')}/avatars/{guild_avatar}.png?size=128"
    if user.get("avatar"):
        return f"https://cdn.discordapp.com/avatars/{user.get('id')}/{user.get('avatar')}.png?size=128"
    return None


async def _send_discord_message(
    channel_id: str | int,
    *,
    content: str | None = None,
    embeds: list[dict] | None = None,
    components: list[dict] | None = None,
) -> None:
    payload: dict = {}
    if content:
        payload["content"] = content
    if embeds:
        payload["embeds"] = embeds
    if components:
        payload["components"] = components
    if not payload:
        return
    await _discord_request("POST", f"/channels/{int(channel_id)}/messages", json_body=payload)


async def _fetch_channel_messages(channel_id: str | int) -> list[dict]:
    messages: list[dict] = []
    before: str | None = None

    while True:
        endpoint = f"/channels/{int(channel_id)}/messages?limit=100"
        if before:
            endpoint += f"&before={before}"
        batch = await _discord_request("GET", endpoint)
        if not isinstance(batch, list) or not batch:
            break
        messages.extend(batch)
        if len(batch) < 100:
            break
        before = batch[-1]["id"]

    messages.reverse()
    return messages


def _message_html(message: dict) -> str:
    author = message.get("author") or {}
    attachments = message.get("attachments") or []
    embeds = message.get("embeds") or []
    avatar = ""
    if author.get("avatar"):
        avatar = f"https://cdn.discordapp.com/avatars/{author.get('id')}/{author.get('avatar')}.png?size=128"

    attachment_html = "".join(
        f'<li><a href="{escape(att.get("url", ""))}" target="_blank" rel="noopener noreferrer">{escape(att.get("filename", "attachment"))}</a></li>'
        for att in attachments
        if att.get("url")
    )
    embed_html = "".join(
        f'<li>{escape(embed.get("title") or embed.get("description") or "Embedded content")}</li>'
        for embed in embeds
    )
    content = escape(message.get("content") or "").replace("\n", "<br>")
    timestamp = message.get("timestamp") or ""
    avatar_html = (
        f'<img src="{escape(avatar)}" alt="avatar">'
        if avatar
        else escape((author.get("username") or "?")[:1])
    )
    attachments_list = f'<ul class="attachments">{attachment_html}</ul>' if attachment_html else ""
    embeds_list = f'<ul class="embeds">{embed_html}</ul>' if embed_html else ""
    return (
        '<article class="message">'
        f'<div class="avatar">{avatar_html}</div>'
        '<div class="body">'
        f'<div class="meta"><strong>{escape(author.get("global_name") or author.get("username") or "Unknown User")}</strong> '
        f'<span>{escape(timestamp)}</span></div>'
        f'<div class="content">{content or "<em>No text content</em>"}</div>'
        f"{attachments_list}"
        f"{embeds_list}"
        '</div>'
        '</article>'
    )


def _build_transcript_html(channel_name: str, messages: list[dict]) -> str:
    message_html = "".join(_message_html(message) for message in messages)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Transcript - {escape(channel_name)}</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #111827;
      --card: #1f2937;
      --muted: #9ca3af;
      --text: #f9fafb;
      --border: #374151;
      --accent: #60a5fa;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: Arial, sans-serif; background: var(--bg); color: var(--text); }}
    main {{ max-width: 1000px; margin: 0 auto; padding: 24px; }}
    header {{ margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }}
    .message {{ display: grid; grid-template-columns: 48px 1fr; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--border); }}
    .avatar {{ width: 48px; height: 48px; border-radius: 999px; overflow: hidden; background: var(--card); display: flex; align-items: center; justify-content: center; font-weight: bold; }}
    .avatar img {{ width: 100%; height: 100%; object-fit: cover; }}
    .body {{ min-width: 0; }}
    .meta {{ display: flex; gap: 8px; align-items: baseline; margin-bottom: 6px; }}
    .meta span {{ color: var(--muted); font-size: 12px; }}
    .content {{ line-height: 1.5; white-space: normal; word-break: break-word; }}
    ul {{ margin: 8px 0 0; padding-left: 18px; }}
    a {{ color: var(--accent); }}
    em {{ color: var(--muted); }}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>{escape(channel_name)}</h1>
      <p>{len(messages)} messages exported from Discord.</p>
    </header>
    {message_html or "<p>No messages found.</p>"}
  </main>
</body>
</html>"""


async def _generate_transcript_link(channel_id: str | int, label: str) -> str | None:
    channel = await _fetch_discord_channel(channel_id)
    if channel is None:
        return None

    messages = await _fetch_channel_messages(channel_id)
    transcript_html = _build_transcript_html(channel.get("name") or str(channel_id), messages)
    slug = f"transcript-{label}-{channel_id}"
    return await upload_html_to_cdn(slug, transcript_html)


async def _send_ticket_status_log(
    *,
    actor_user_id: str,
    ticket_doc: dict,
    panel_doc: dict,
    channel_name: str,
    status: str,
) -> None:
    try:
        log_channel_id = panel_doc.get("status_change_log")
        if not log_channel_id:
            return

        actor_user = await _fetch_discord_user(actor_user_id)
        ticket_user = await _fetch_discord_user(ticket_doc["user"])
        actor_avatar = None
        if actor_user.get("avatar"):
            actor_avatar = f"https://cdn.discordapp.com/avatars/{actor_user['id']}/{actor_user['avatar']}.png?size=128"

        embed = {
            "description": (
                f"**Status Changed | {status.capitalize()}**\n"
                f" - By: <@{actor_user_id}>\n"
                f" - Ticket: {channel_name}, <@{ticket_doc['user']}>({ticket_user.get('username', ticket_doc['user'])})\n"
                f" - Time: {_discord_timestamp(datetime.now(timezone.utc))}"
            ),
            "color": 2829617,
            "author": {
                "name": actor_user.get("global_name") or actor_user.get("username") or f"User {actor_user_id}",
                "icon_url": actor_avatar,
            },
        }
        await _send_discord_message(log_channel_id, embeds=[embed])
    except Exception:
        pass


async def _send_ticket_close_log(
    *,
    actor_user_id: str,
    ticket_doc: dict,
    panel_doc: dict,
    channel_name: str,
) -> None:
    try:
        log_channel_id = panel_doc.get("ticket_close_log")
        if not log_channel_id:
            return

        actor_user = await _fetch_discord_user(actor_user_id)
        ticket_user = await _fetch_discord_user(ticket_doc["user"])
        actor_avatar = None
        if actor_user.get("avatar"):
            actor_avatar = f"https://cdn.discordapp.com/avatars/{actor_user['id']}/{actor_user['avatar']}.png?size=128"

        components_buttons = []
        channel_link = await _generate_transcript_link(ticket_doc["channel"], "channel")
        if channel_link:
            components_buttons.append({"type": 2, "style": 5, "label": "Channel", "url": channel_link})

        if ticket_doc.get("thread"):
            thread_link = await _generate_transcript_link(ticket_doc["thread"], "thread")
            if thread_link:
                components_buttons.append({"type": 2, "style": 5, "label": "Thread", "url": thread_link})

        embed = {
            "description": (
                f"**Ticket Closed**\n"
                f" - By: <@{actor_user_id}>\n"
                f" - Ticket: {channel_name}, <@{ticket_doc['user']}>({ticket_user.get('username', ticket_doc['user'])})\n"
                f" - Time: {_discord_timestamp(datetime.now(timezone.utc))}\n"
                f" - Ticket Creation: {_discord_timestamp(_discord_snowflake_to_datetime(ticket_doc['channel']))}"
            ),
            "color": 2829617,
            "author": {
                "name": actor_user.get("global_name") or actor_user.get("username") or f"User {actor_user_id}",
                "icon_url": actor_avatar,
            },
        }
        components = [{"type": 1, "components": components_buttons}] if components_buttons else None
        await _send_discord_message(log_channel_id, embeds=[embed], components=components)
    except Exception:
        pass


async def _rename_ticket_channel(
    rest: hikari.RESTApp,
    mongo: MongoClient,
    coc_client: CustomClashClient,
    ticket_doc: dict,
    status: str,
) -> None:
    naming = ticket_doc.get("naming") or ""
    if "status" not in naming:
        return

    user_name = ""
    async with rest.acquire(token=config.bot_token, token_type=hikari.TokenType.BOT) as client:
        try:
            user = await client.fetch_user(int(ticket_doc["user"]))
            user_name = getattr(user, "global_name", None) or user.username or ""
        except Exception:
            user_name = ""

    account_name = ""
    account_th = ""
    apply_account = ticket_doc.get("apply_account")
    if apply_account:
        try:
            player = await coc_client.get_player(apply_account)
            if player:
                account_name = player.name or ""
                account_th = str(player.town_hall or "")
        except Exception:
            pass

    status_emoji = {"open": "✅", "sleep": "💤", "closed": "❌", "delete": "❌"}
    replacements = {
        "{ticket_count}": str(ticket_doc.get("number", "")),
        "{user}": user_name,
        "{account_name}": account_name,
        "{account_th}": account_th,
        "{ticket_status}": status,
        "{emoji_status}": status_emoji.get(status, ""),
    }

    new_name = naming
    for key, value in replacements.items():
        new_name = new_name.replace(key, value)

    if new_name:
        await _discord_request("PATCH", f"/channels/{ticket_doc['channel']}", json_body={"name": new_name[:100]})


async def _update_ticket_channel_for_status(
    ticket_doc: dict,
    panel_doc: dict,
    status: str,
    rest: hikari.RESTApp,
    mongo: MongoClient,
    coc_client: CustomClashClient,
) -> None:
    channel_id = int(ticket_doc["channel"])

    if status in {"open", "sleep", "closed"}:
        category_id = panel_doc.get(f"{status}-category")
        if category_id is not None:
            await _discord_request("PATCH", f"/channels/{channel_id}", json_body={"parent_id": str(category_id)})

    if status in {"open", "closed"}:
        allow = int(hikari.Permissions.VIEW_CHANNEL) if status == "open" else 0
        deny = 0 if status == "open" else int(hikari.Permissions.VIEW_CHANNEL)
        await _discord_request(
            "PUT",
            f"/channels/{channel_id}/permissions/{ticket_doc['user']}",
            json_body={"allow": str(allow), "deny": str(deny), "type": 1},
        )

    await _rename_ticket_channel(rest, mongo, coc_client, ticket_doc, status)


def serialize_panel(doc: dict) -> TicketPanel:
    components_raw = doc.get("components") or []
    components = [
        TicketButton(
            custom_id=c.get("custom_id", ""),
            label=c.get("label", ""),
            style=int(c.get("style", 1)),
            emoji=c.get("emoji") or None,
            type=int(c.get("type", 2)),
        )
        for c in components_raw
        if c.get("custom_id")
    ]

    button_settings: dict[str, TicketButtonSettings] = {}
    for comp in components:
        raw = doc.get(f"{comp.custom_id}_settings") or {}
        button_settings[comp.custom_id] = TicketButtonSettings(
            questions=[q for q in (raw.get("questions") or []) if q],
            mod_role=[str(r) for r in (raw.get("mod_role") or [])],
            no_ping_mod_role=[str(r) for r in (raw.get("no_ping_mod_role") or [])],
            private_thread=bool(raw.get("private_thread", False)),
            th_min=int(raw.get("th_min") or 0),
            num_apply=int(raw.get("num_apply") or 25),
            naming=raw.get("naming") or "",
            account_apply=bool(raw.get("account_apply", False)),
            player_info=bool(raw.get("player_info", False)),
            apply_clans=[str(c) for c in (raw.get("apply_clans") or [])],
            roles_to_add=[str(r) for r in (raw.get("roles_to_add") or [])],
            roles_to_remove=[str(r) for r in (raw.get("roles_to_remove") or [])],
            townhall_requirements={
                str(th): {k: int(v) for k, v in reqs.items()}
                for th, reqs in (raw.get("townhall_requirements") or {}).items()
                if isinstance(reqs, dict)
            },
            new_message=raw.get("new_message"),
        )

    raw_approve = doc.get("approve_messages") or []
    approve_messages = [
        ApproveMessage(name=m.get("name", ""), message=m.get("message", ""))
        for m in raw_approve
        if isinstance(m, dict)
    ]

    return TicketPanel(
        name=doc.get("name", ""),
        server_id=int(doc.get("server_id", 0)),
        embed_name=doc.get("embed_name"),
        components=components,
        button_settings=button_settings,
        open_category=_str_or_none(doc.get("open-category")),
        sleep_category=_str_or_none(doc.get("sleep-category")),
        closed_category=_str_or_none(doc.get("closed-category")),
        status_change_log=_str_or_none(doc.get("status_change_log")),
        ticket_button_click_log=_str_or_none(doc.get("ticket_button_click_log")),
        ticket_close_log=_str_or_none(doc.get("ticket_close_log")),
        approve_messages=approve_messages,
    )


@router.get("/{server_id}/tickets")
@linkd.ext.fastapi.inject
@check_authentication
async def get_ticket_panels(
    server_id: int,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> TicketPanelsResponse:
    panels_raw = await mongo.ticketing.find({"server_id": server_id}, {"_id": 0}).to_list(length=None)
    panels = [serialize_panel(p) for p in panels_raw]
    embed_docs = await mongo.embeds.find({"server": server_id}, {"_id": 0, "name": 1}).to_list(length=None)
    available_embeds = sorted([doc.get("name") for doc in embed_docs if doc.get("name")])
    return TicketPanelsResponse(items=panels, total=len(panels), available_embeds=available_embeds)


@router.get("/{server_id}/tickets/open")
@linkd.ext.fastapi.inject
@check_authentication
async def get_open_tickets(
    server_id: int,
    status: str | None = None,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> OpenTicketsResponse:
    query: dict = {"server": server_id}
    if status:
        query["status"] = status

    tickets_raw = await mongo.open_tickets.find(query, {"_id": 0}).to_list(length=None)
    tickets = [
        t for t in tickets_raw
    ]
    serialized_tickets: list[OpenTicket] = []
    for ticket_doc in tickets:
        channel_doc = await _fetch_discord_channel(ticket_doc.get("channel"))
        channel_exists = channel_doc is not None
        user_id = str(ticket_doc.get("user", ""))
        member = await _fetch_discord_member(server_id, user_id)
        member_user = (member or {}).get("user") or {}

        discord_username = member_user.get("username")
        discord_display_name = (member or {}).get("nick") or discord_username
        discord_avatar_url = _member_avatar_url({**member, "guild_id": str(server_id)} if member else None)

        if not discord_username:
            user_query = [{"linked_accounts.discord.discord_user_id": user_id}]
            try:
                user_query.append({"linked_accounts.discord.discord_user_id": int(user_id)})
            except (TypeError, ValueError):
                pass
            user_doc = await mongo.users.find_one(
                {"$or": user_query},
                {"_id": 0, "linked_accounts.discord": 1},
            )
            discord_link = ((user_doc or {}).get("linked_accounts") or {}).get("discord") or {}
            discord_username = discord_link.get("username")
            discord_display_name = discord_display_name or discord_username
            discord_avatar_url = discord_avatar_url or discord_link.get("avatar_url")

        serialized_tickets.append(
            OpenTicket(
                channel=str(ticket_doc.get("channel", "")),
                channel_exists=channel_exists,
                user=user_id,
                discord_username=discord_username,
                discord_display_name=discord_display_name,
                discord_avatar_url=discord_avatar_url,
                thread=_str_or_none(ticket_doc.get("thread")),
                server=str(ticket_doc.get("server", "")),
                status=ticket_doc.get("status", "open"),
                number=int(ticket_doc.get("number", 0)),
                apply_account=ticket_doc.get("apply_account"),
                panel=ticket_doc.get("panel", ""),
                set_clan=ticket_doc.get("set_clan"),
            )
        )
    return OpenTicketsResponse(items=serialized_tickets, total=len(serialized_tickets))


@router.put("/{server_id}/tickets/{panel_name}")
@linkd.ext.fastapi.inject
@check_authentication
async def update_ticket_panel(
    server_id: int,
    panel_name: str,
    body: UpdateTicketPanelRequest,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> MessageResponse:
    def to_int_or_none(value: str | None):
        if value is None or value == "":
            return None
        return int(value)

    update_fields: dict = {}
    if body.open_category is not None:
        update_fields["open-category"] = to_int_or_none(body.open_category)
    if body.sleep_category is not None:
        update_fields["sleep-category"] = to_int_or_none(body.sleep_category)
    if body.closed_category is not None:
        update_fields["closed-category"] = to_int_or_none(body.closed_category)
    if body.status_change_log is not None:
        update_fields["status_change_log"] = to_int_or_none(body.status_change_log)
    if body.ticket_button_click_log is not None:
        update_fields["ticket_button_click_log"] = to_int_or_none(body.ticket_button_click_log)
    if body.ticket_close_log is not None:
        update_fields["ticket_close_log"] = to_int_or_none(body.ticket_close_log)
    if body.embed_name is not None:
        update_fields["embed_name"] = body.embed_name or None

    if update_fields:
        await mongo.ticketing.update_one(
            {"server_id": server_id, "name": panel_name},
            {"$set": update_fields},
        )

    return MessageResponse(message="Panel updated successfully")


@router.put("/{server_id}/tickets/{panel_name}/buttons/{custom_id}")
@linkd.ext.fastapi.inject
@check_authentication
async def update_button_settings(
    server_id: int,
    panel_name: str,
    custom_id: str,
    body: UpdateButtonSettingsRequest,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> MessageResponse:
    # Verify the button belongs to this panel
    panel = await mongo.ticketing.find_one({"server_id": server_id, "name": panel_name})
    if not panel:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Panel not found")

    components = panel.get("components") or []
    if not any(c.get("custom_id") == custom_id for c in components):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Button not found in panel")

    settings = {
        "questions": [q for q in body.questions if q],
        "mod_role": [int(r) for r in body.mod_role if r],
        "no_ping_mod_role": [int(r) for r in body.no_ping_mod_role if r],
        "private_thread": body.private_thread,
        "th_min": body.th_min,
        "num_apply": body.num_apply,
        "naming": body.naming or "{ticket_count}-{user}",
        "account_apply": body.account_apply,
        "player_info": body.player_info,
        "apply_clans": [str(c) for c in body.apply_clans if c],
        "roles_to_add": [int(r) for r in body.roles_to_add if r],
        "roles_to_remove": [int(r) for r in body.roles_to_remove if r],
        "townhall_requirements": {
            str(th): {k: int(v) for k, v in reqs.items()}
            for th, reqs in body.townhall_requirements.items()
            if isinstance(reqs, dict)
        },
        "new_message": body.new_message or None,
    }

    await mongo.ticketing.update_one(
        {"server_id": server_id, "name": panel_name},
        {"$set": {f"{custom_id}_settings": settings}},
    )

    return MessageResponse(message="Button settings updated successfully")


@router.put("/{server_id}/tickets/{panel_name}/approve-messages")
@linkd.ext.fastapi.inject
@check_authentication
async def update_approve_messages(
    server_id: int,
    panel_name: str,
    body: UpdateApproveMessagesRequest,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> MessageResponse:
    messages = [{"name": m.name, "message": m.message} for m in body.messages if m.name]

    await mongo.ticketing.update_one(
        {"server_id": server_id, "name": panel_name},
        {"$set": {"approve_messages": messages}},
    )

    return MessageResponse(message="Approve messages updated successfully")


@router.put("/{server_id}/tickets/open/{channel_id}/status")
@linkd.ext.fastapi.inject
@check_authentication
async def update_open_ticket_status(
    server_id: int,
    channel_id: str,
    body: UpdateOpenTicketStatusRequest,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp,
    coc_client: CustomClashClient,
) -> MessageResponse:
    normalized_status = body.status.lower()
    if normalized_status == "close":
        normalized_status = "closed"
    if normalized_status not in {"open", "sleep", "closed", "delete"}:
        raise HTTPException(status_code=400, detail="Invalid ticket status")

    ticket_doc = await mongo.open_tickets.find_one(_ticket_channel_query(server_id, channel_id))
    if not ticket_doc:
        raise HTTPException(status_code=404, detail="Open ticket not found")

    panel_doc = await mongo.ticketing.find_one({"server_id": server_id, "name": ticket_doc.get("panel")})
    if not panel_doc:
        raise HTTPException(status_code=404, detail="Ticket panel not found")

    channel_name = str(channel_id)
    channel_doc = await _fetch_discord_channel(channel_id)
    if channel_doc and channel_doc.get("name"):
        channel_name = channel_doc["name"]

    await mongo.open_tickets.update_one(
        _ticket_channel_query(server_id, channel_id),
        {"$set": {"status": normalized_status}},
    )
    ticket_doc["status"] = normalized_status

    if _user_id:
        await _send_ticket_status_log(
            actor_user_id=_user_id,
            ticket_doc=ticket_doc,
            panel_doc=panel_doc,
            channel_name=channel_name,
            status=normalized_status,
        )

    if normalized_status == "delete":
        if _user_id:
            await _send_ticket_close_log(
                actor_user_id=_user_id,
                ticket_doc=ticket_doc,
                panel_doc=panel_doc,
                channel_name=channel_name,
            )
        try:
            await _discord_request("DELETE", f"/channels/{ticket_doc['channel']}")
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
        return MessageResponse(message="Ticket deleted successfully")

    await _update_ticket_channel_for_status(ticket_doc, panel_doc, normalized_status, rest, mongo, coc_client)
    return MessageResponse(message="Ticket status updated successfully")


@router.put("/{server_id}/tickets/open/{channel_id}/clan")
@linkd.ext.fastapi.inject
@check_authentication
async def update_open_ticket_clan(
    server_id: int,
    channel_id: str,
    body: UpdateOpenTicketClanRequest,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> MessageResponse:
    ticket_doc = await mongo.open_tickets.find_one(_ticket_channel_query(server_id, channel_id))
    if not ticket_doc:
        raise HTTPException(status_code=404, detail="Open ticket not found")

    clan_tag = body.set_clan
    if clan_tag:
        normalized = clan_tag.strip().upper()
        if not normalized.startswith("#"):
            normalized = f"#{normalized}"
        clan_exists = await mongo.clan_db.find_one({"server": server_id, "tag": normalized})
        if not clan_exists:
            raise HTTPException(status_code=404, detail="Clan not found on this server")
        clan_tag = normalized

    await mongo.open_tickets.update_one(
        _ticket_channel_query(server_id, channel_id),
        {"$set": {"set_clan": clan_tag}},
    )
    return MessageResponse(message="Ticket clan updated successfully")


@router.delete("/{server_id}/tickets/open/{channel_id}")
@linkd.ext.fastapi.inject
@check_authentication
async def delete_open_ticket(
    server_id: int,
    channel_id: str,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> MessageResponse:
    ticket_doc = await mongo.open_tickets.find_one(_ticket_channel_query(server_id, channel_id))
    if not ticket_doc:
        raise HTTPException(status_code=404, detail="Open ticket not found")

    panel_doc = await mongo.ticketing.find_one({"server_id": server_id, "name": ticket_doc.get("panel")})
    if not panel_doc:
        raise HTTPException(status_code=404, detail="Ticket panel not found")

    channel_name = str(channel_id)
    channel_doc = await _fetch_discord_channel(channel_id)
    if channel_doc and channel_doc.get("name"):
        channel_name = channel_doc["name"]

    await mongo.open_tickets.update_one(
        _ticket_channel_query(server_id, channel_id),
        {"$set": {"status": "delete"}},
    )
    ticket_doc["status"] = "delete"

    if _user_id:
        await _send_ticket_close_log(
            actor_user_id=_user_id,
            ticket_doc=ticket_doc,
            panel_doc=panel_doc,
            channel_name=channel_name,
        )

    try:
        await _discord_request("DELETE", f"/channels/{ticket_doc['channel']}")
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
    return MessageResponse(message="Ticket deleted successfully")


@router.get("/{server_id}/embeds")
@linkd.ext.fastapi.inject
@check_authentication
async def get_server_embeds(
    server_id: int,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> ServerEmbedsResponse:
    docs = await mongo.embeds.find(
        {"server": server_id}, {"_id": 0, "name": 1, "data": 1}
    ).to_list(length=None)
    items = sorted(
        [ServerEmbed(name=d["name"], data=d.get("data")) for d in docs if d.get("name")],
        key=lambda x: x.name,
    )
    return ServerEmbedsResponse(items=items, total=len(items))


@router.post("/{server_id}/embeds")
@linkd.ext.fastapi.inject
@check_authentication
async def create_server_embed(
    server_id: int,
    body: UpsertEmbedRequest,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> MessageResponse:
    existing = await mongo.embeds.find_one({"server": server_id, "name": body.name})
    if existing:
        raise HTTPException(status_code=409, detail="An embed with this name already exists")
    await mongo.embeds.insert_one({"server": server_id, "name": body.name, "data": body.data})
    return MessageResponse(message="Embed created successfully")


@router.put("/{server_id}/embeds/{embed_name}")
@linkd.ext.fastapi.inject
@check_authentication
async def update_server_embed(
    server_id: int,
    embed_name: str,
    body: UpsertEmbedRequest,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> MessageResponse:
    await mongo.embeds.update_one(
        {"server": server_id, "name": embed_name},
        {"$set": {"data": body.data}},
        upsert=True,
    )
    return MessageResponse(message="Embed updated successfully")


@router.delete("/{server_id}/embeds/{embed_name}")
@linkd.ext.fastapi.inject
@check_authentication
async def delete_server_embed(
    server_id: int,
    embed_name: str,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> MessageResponse:
    result = await mongo.embeds.delete_one({"server": server_id, "name": embed_name})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Embed not found")
    return MessageResponse(message="Embed deleted successfully")
