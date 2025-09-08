import coc
import pendulum as pend
from bson import ObjectId
from coc.utils import correct_tag

from utils.database import MongoClient as mongo


async def calculate_player_hitrate(player_tag: str, days: int = 30) -> float:
    """Calculate player's hitrate over the last X days."""
    # Calculate time range
    end_time = pend.now(tz=pend.UTC)
    start_time = end_time.subtract(days=days)

    START = start_time.strftime('%Y%m%dT%H%M%S.000Z')
    END = end_time.strftime('%Y%m%dT%H%M%S.000Z')

    player_tag = correct_tag(player_tag)

    pipeline = [
        {
            '$match': {
                '$and': [
                    {
                        '$or': [
                            {'data.clan.members.tag': player_tag},
                            {'data.opponent.members.tag': player_tag},
                        ]
                    },
                    {'data.preparationStartTime': {'$gte': START}},
                    {'data.preparationStartTime': {'$lte': END}},
                ]
            }
        },
        {'$sort': {'data.preparationStartTime': -1}},
        {'$project': {'data': '$data'}},
    ]

    try:
        wars_docs = await mongo.clan_wars.aggregate(
            pipeline, allowDiskUse=True
        ).to_list(length=None)

        total_attacks = 0
        three_star_attacks = 0

        for war_doc in wars_docs:
            war_data = war_doc['data']

            # Check both clan and opponent attacks
            for side in ['clan', 'opponent']:
                for member in war_data[side].get('members', []):
                    if member['tag'] == player_tag:
                        for attack in member.get('attacks', []):
                            total_attacks += 1
                            if attack['stars'] == 3:
                                three_star_attacks += 1

        if total_attacks == 0:
            return 0.0

        return round((three_star_attacks / total_attacks) * 100, 2)
    except Exception:
        return 0.0


async def get_player_last_online(player_tag: str) -> int:
    """Get player's last online timestamp from player_stats database."""
    try:
        player_tag = correct_tag(player_tag)
        result = await mongo.player_stats.find_one(
            {'tag': player_tag}, {'last_online': 1}
        )
        return result.get('last_online', 0) if result else 0
    except Exception:
        return 0


async def calculate_player_activity(player_tag: str, days: int = 30) -> int:
    """Calculate player's activity based on player_history collection."""
    try:
        player_tag = correct_tag(player_tag)

        # Calculate timestamp X days ago
        days_ago = int(pend.now('UTC').subtract(days=days).timestamp())

        # Count distinct days the player had activity in player_history
        pipeline = [
            {'$match': {'tag': player_tag, 'time': {'$gte': days_ago}}},
            {
                '$group': {
                    '_id': {
                        '$dateToString': {
                            'format': '%Y-%m-%d',
                            'date': {
                                '$toDate': {'$multiply': ['$time', 1000]}
                            },
                        }
                    },
                    'count': {'$sum': 1},
                }
            },
            {'$count': 'total_days'},
        ]

        result = await mongo.player_history.aggregate(pipeline).to_list(
            length=1
        )
        return result[0]['total_days'] if result else 0
    except Exception:
        return 0


async def calculate_bulk_stats(player_tags: list[str]) -> dict:
    """Calculate hitrate, last_online, and activity for multiple players efficiently."""
    stats = {}

    for tag in player_tags:
        stats[tag] = {
            'hitrate': await calculate_player_hitrate(tag),
            'last_online': await get_player_last_online(tag),
            'activity': await calculate_player_activity(tag),
        }

    return stats


def extract_discord_user_id(discord_mention: str) -> str:
    """Extract Discord user ID from mention string."""
    if not discord_mention or discord_mention == 'No User':
        return 'No User'

    # Remove <@> and <@!> formatting to get just the ID
    if discord_mention.startswith('<@'):
        return discord_mention.strip('<@!>')

    return discord_mention  # Already just an ID or custom format


async def check_user_account_limit(
    roster_id: str, discord_user: str, exclude_tag: str = None
) -> tuple[bool, int, int]:
    """
    Check if adding this member would exceed the roster's account limit per user.
    Returns: (is_valid, current_count, max_allowed)
    """
    try:
        _id = ObjectId(roster_id)
    except Exception:
        return True, 0, 0  # Invalid ID, let other validation handle it

    roster = await mongo.rosters.find_one({'_id': _id})
    if not roster:
        return True, 0, 0  # Roster not found, let other validation handle it

    max_accounts = roster.get('max_accounts_per_user')
    if max_accounts is None:
        return True, 0, 0  # No limit set

    discord_user_id = extract_discord_user_id(discord_user)
    if discord_user_id == 'No User':
        return True, 0, max_accounts  # No Discord user, no limit

    # Count current accounts for this Discord user
    members = roster.get('members', [])
    current_count = 0

    for member in members:
        if exclude_tag and member.get('tag') == exclude_tag:
            continue  # Don't count the member we're potentially replacing

        member_discord_id = extract_discord_user_id(
            member.get('discord', 'No User')
        )
        if member_discord_id == discord_user_id:
            current_count += 1

    is_valid = current_count < max_accounts
    return is_valid, current_count, max_accounts


async def refresh_member_data(
    member: dict, coc_client: coc.Client
) -> tuple[dict, str]:
    """
    Refresh a single member's data from CoC API.
    Returns: (updated_member_dict, action)
    Actions: 'updated', 'remove', 'no_change'
    """
    try:
        player_tag = member['tag']
        player = await coc_client.get_player(player_tag)

        # Calculate hero levels sum
        hero_lvs = sum(hero.level for hero in player.heroes)

        # Get current clan info
        current_clan = player.clan.name if player.clan else 'No Clan'
        current_clan_tag = player.clan.tag if player.clan else '#'

        # Calculate stats for enhanced member data
        hitrate = await calculate_player_hitrate(player.tag)
        last_online = await get_player_last_online(player.tag)

        # Get league name
        current_league = player.league.name if player.league else 'Unranked'

        # Update member data with enhanced fields
        member.update(
            {
                'name': player.name,
                'hero_lvs': hero_lvs,
                'townhall': player.town_hall,
                'current_clan': current_clan,
                'current_clan_tag': current_clan_tag,
                'war_pref': player.war_opted_in,
                'trophies': player.trophies,
                'hitrate': hitrate,
                'last_online': last_online,
                'current_league': current_league,
                'last_updated': int(pend.now('UTC').timestamp()),
                'member_status': 'active',
                'error_details': None,
            }
        )

        return member, 'updated'

    except coc.NotFound:
        # Player doesn't exist anymore - mark for removal
        return member, 'remove'

    except Exception as e:
        # API error - keep existing data, just update tracking fields
        member.update(
            {
                'last_updated': int(pend.now('UTC').timestamp()),
                'member_status': 'api_error',
                'error_details': str(e),
            }
        )
        return member, 'no_change'
