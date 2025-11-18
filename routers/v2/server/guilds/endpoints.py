import hikari
import linkd
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List

from utils.database import MongoClient
from utils.security import check_authentication
from routers.v2.auth.auth_utils import get_valid_discord_access_token
from utils.config import Config
from .models import GuildInfo, GuildDetails

config = Config()

security = HTTPBearer()
router = APIRouter(prefix="/v2/guilds", tags=["Guilds"], include_in_schema=True)
guild_router = APIRouter(prefix="/v2/guild", tags=["Guild"], include_in_schema=True)


@router.get("", name="Get user guilds with bot status")
@linkd.ext.fastapi.inject
@check_authentication
async def get_user_guilds(
    user_id: str = None,
    device_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp
) -> List[GuildInfo]:
    """
    Fetch user's Discord guilds and check which ones have ClashKing bot.
    Only returns guilds where user has MANAGE_GUILD permission.
    """
    try:
        # Get valid Discord access token for this user
        discord_access_token = await get_valid_discord_access_token(user_id, device_id, rest, mongo)

        # Fetch user's guilds from Discord
        async with rest.acquire(token=discord_access_token, token_type=hikari.TokenType.BEARER) as client:
            try:
                guilds_response = await client.fetch_my_guilds()

            except hikari.UnauthorizedError as e:
                raise HTTPException(
                    status_code=401,
                    detail="Discord token expired or invalid. Please log in again."
                )
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to fetch guilds from Discord: {str(e)}"
                )

        # Filter guilds where user has MANAGE_GUILD permission (0x20)
        admin_guilds = []
        for guild in guilds_response:
            # OwnGuild uses 'my_permissions' not 'permissions'
            permissions = int(guild.my_permissions) if hasattr(guild, 'my_permissions') else 0
            # Check if user has MANAGE_GUILD permission or is owner
            has_manage = bool(permissions & 0x20)
            is_owner = guild.is_owner if hasattr(guild, 'is_owner') else False
            if has_manage or is_owner:
                admin_guilds.append(guild)

        # Get bot's guilds to check presence
        bot_guild_ids = set()
        try:
            # Fetch guilds the bot is in
            # Note: This requires bot token, not user token
            async with rest.acquire(token=config.bot_token, token_type=hikari.TokenType.BOT) as bot_client:
                bot_guilds = await bot_client.fetch_my_guilds()
                bot_guild_ids = {str(g.id) for g in bot_guilds}
        except Exception as e:
            print(f"⚠️ Could not fetch bot guilds: {e}")
            # Continue anyway - we'll just mark all as not having the bot

        # Build response with bot presence info
        result = []
        i = 0
        for guild in admin_guilds:
            i += 1
            guild_id = str(guild.id)
            has_bot = guild_id in bot_guild_ids

            # Try to get member count if available
            member_count = None
            if hasattr(guild, 'approximate_member_count'):
                member_count = guild.approximate_member_count

            perms = getattr(guild, 'my_permissions', hikari.Permissions.NONE)
            role = (
                "Owner" if getattr(guild, 'is_owner', False)
                else "Administrator" if perms & hikari.Permissions.ADMINISTRATOR
                else "Manager" if perms & hikari.Permissions.MANAGE_GUILD
                else "Member"
            )

            result.append(GuildInfo(
                id=guild_id,
                name=guild.name,
                icon = str(guild.icon_url) if guild.icon_url else "https://cdn.discordapp.com/embed/avatars/0.png",
                owner=guild.is_owner if hasattr(guild, 'is_owner') else False,
                permissions=str(guild.my_permissions) if hasattr(guild, 'my_permissions') else "0",
                role=role,
                features=list(guild.features) if hasattr(guild, 'features') else [],
                has_bot=has_bot,
                member_count=member_count
            ))

        print(f"🔍 Returning {len(result)} guilds with bot status")
        return result

    except HTTPException:
        print("⚠️ HTTPException occurred, re-raising")
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@guild_router.get("/{server_id}", name="Get guild details by ID")
@linkd.ext.fastapi.inject
@check_authentication
async def get_guild_details(
    server_id: int,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp
) -> GuildDetails:
    """
    Fetch detailed information about a specific Discord guild/server.
    User must be a member of the guild.
    """
    try:
        # Verify bot token is configured
        if not config.bot_token:
            raise HTTPException(
                status_code=500,
                detail="Bot token not configured"
            )

        # Fetch guild details using bot token
        async with rest.acquire(token=config.bot_token, token_type=hikari.TokenType.BOT) as client:
            try:
                guild = await client.fetch_guild(server_id)
            except hikari.NotFoundError:
                raise HTTPException(
                    status_code=404,
                    detail="Guild not found"
                )
            except hikari.ForbiddenError:
                raise HTTPException(
                    status_code=403,
                    detail="Bot does not have access to this guild"
                )

            # Verify user is a member of this guild
            try:
                await client.fetch_member(server_id, user_id)
            except hikari.NotFoundError:
                raise HTTPException(
                    status_code=403,
                    detail="You are not a member of this guild"
                )

        # Build response
        return GuildDetails(
            id=str(guild.id),
            name=guild.name,
            icon=str(guild.icon_url) if guild.icon_url else None,
            owner_id=str(guild.owner_id) if guild.owner_id else None,
            features=list(guild.features) if guild.features else [],
            member_count=guild.approximate_member_count if hasattr(guild, 'approximate_member_count') else None,
            description=guild.description if hasattr(guild, 'description') else None,
            banner=str(guild.banner_url) if hasattr(guild, 'banner_url') and guild.banner_url else None,
            premium_tier=guild.premium_tier.value if hasattr(guild, 'premium_tier') and guild.premium_tier else 0,
            boost_count=guild.premium_subscription_count if hasattr(guild, 'premium_subscription_count') else 0
        )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch guild details: {str(e)}"
        )
