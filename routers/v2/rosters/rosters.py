import coc
import linkd
import pendulum as pend
import pymongo
from coc.utils import correct_tag
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from routers.v2.rosters.roster_models import (AddMembersByTagModel,
                                              CreateRosterAutomationModel,
                                              CreateRosterGroupModel,
                                              CreateRosterModel,
                                              CreateRosterSignupCategoryModel,
                                              EventMissingMembersModel,
                                              RosterCloneModel,
                                              RosterMemberBulkOperationModel,
                                              RosterUpdateModel,
                                              UpdateMemberModel,
                                              UpdateRosterAutomationModel,
                                              UpdateRosterGroupModel,
                                              UpdateRosterSignupCategoryModel)
from routers.v2.rosters.roster_utils import (calculate_bulk_stats,
                                             calculate_player_hitrate,
                                             check_user_account_limit,
                                             extract_discord_user_id,
                                             get_player_last_online,
                                             refresh_member_data)
from utils.custom_coc import CustomClashClient
from utils.database import MongoClient
from utils.security import check_authentication
from utils.utils import gen_clean_custom_id, generate_access_token

router = APIRouter(prefix='/v2', tags=['Rosters'], include_in_schema=True)
security = HTTPBearer()


@router.post('/roster', name='Create a roster')
@linkd.ext.fastapi.inject
@check_authentication
async def create_roster(
    server_id: int,
    roster_data: CreateRosterModel,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    coc_client: CustomClashClient,
):
    clan = await coc_client.get_clan(tag=roster_data.clan_tag)

    roster_doc = roster_data.model_dump()
    ext_data = {
        'server_id': server_id,
        'custom_id': gen_clean_custom_id(),
        'clan_name': clan.name,
        'clan_tag': clan.tag,
        'clan_badge': clan.badge.large,
        'members': [],
        'created_at': pend.now(tz=pend.UTC),
        'updated_at': pend.now(tz=pend.UTC),
        # Display defaults
        'columns': ['Townhall Level', 'Name', '30 Day Hitrate', 'Clan Tag'],
        'sort': [],
    }
    roster_doc.update(ext_data)
    await mongo.rosters.insert_one(roster_doc)
    return {
        'message': 'Roster created successfully',
        'roster_id': ext_data.get('custom_id'),
    }


@router.patch('/roster/{roster_id}', name='Update a Roster')
@linkd.ext.fastapi.inject
@check_authentication
async def update_roster(
    server_id: int,
    roster_id: str,
    payload: RosterUpdateModel,
    group_id: str = None,  # For group updates
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    coc_client: CustomClashClient,
):
    """Update roster settings. It supports both individual roster and group updates"""

    body = payload.model_dump(exclude_none=True)
    if not body:
        return {'message': 'Nothing to update'}

    # Handle clan_tag update if needed
    if 'clan_tag' in body:
        clan = await coc_client.get_clan(tag=payload.clan_tag)
        body['clan_name'] = clan.name
        body['clan_tag'] = clan.tag

    body['updated_at'] = pend.now(tz=pend.UTC)

    if roster_id and not group_id:
        # Update single roster
        result = await mongo.rosters.find_one_and_update(
            {'custom_id': roster_id},
            {'$set': body},
            projection={'_id': 0},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail='Roster not found')

        return {'message': 'Roster updated', 'roster': result}

    elif group_id:
        # Update all rosters in group
        group = await mongo.roster_groups.find_one({'group_id': group_id})
        if not group:
            raise HTTPException(
                status_code=404, detail='Roster group not found'
            )

        # Remove group_id from body to avoid overriding
        body.pop('group_id', None)

        result = await mongo.rosters.update_many(
            {'group_id': group_id}, {'$set': body}
        )

        return {
            'message': f'Updated {result.modified_count} rosters in group',
            'updated_count': result.modified_count,
            'group_id': group_id,
        }

    else:
        raise HTTPException(
            status_code=400, detail='Must provide roster_id or group_id'
        )


@router.get('/roster/{roster_id}', name='Get a Roster')
@linkd.ext.fastapi.inject
@check_authentication
async def get_roster(
    server_id: int,
    roster_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    doc = await mongo.rosters.find_one({'custom_id': roster_id}, {'_id': 0})
    if not doc:
        raise HTTPException(status_code=404, detail='Roster not found')
    return {'roster': doc}


@router.delete('/roster/{roster_id}', name='Delete a Roster')
@linkd.ext.fastapi.inject
@check_authentication
async def delete_roster(
    server_id: int,
    roster_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    res = await mongo.rosters.delete_one({'custom_id': roster_id})
    if not res:
        raise HTTPException(status_code=404, detail='Roster not found')
    return {'message': 'Roster deleted successfully'}


@router.post(
    '/roster/{roster_id}/members', name='Add Members by Tags (Auto-Fetch Data)'
)
@linkd.ext.fastapi.inject
@check_authentication
async def add_members_to_roster(
    server_id: int,
    roster_id: str,
    payload: AddMembersByTagModel,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    coc_client: CustomClashClient,
):
    roster = await mongo.rosters.find_one({'custom_id': roster_id})
    if not roster:
        raise HTTPException(status_code=404, detail='Roster not found')

    # Get existing member tags to check for duplicates
    existing_tags = {member['tag'] for member in roster.get('members', [])}

    # Fetch player data for each tag
    members_to_add = []
    success_count = 0
    removed_count = 0

    pipeline = [
        {'$match': {'player_tag': {'$in': list(existing_tags)}}},
        {'$group': {'_id': 'user_id', 'count': {'$sum': 1}}},
    ]
    cursor = await mongo.coc_accounts.aggregate(pipeline)
    result = await cursor.to_list(length=None)
    user_to_num_accounts = {d.get('user_id'): d.get('count') for d in result}

    payload_mapping = {
        m.tag: m for m in payload.members if m not in existing_tags
    }
    player_tags = list(payload_mapping.keys())
    cursor = await mongo.coc_accounts.find(
        {'player_tag': {'$in': player_tags}}
    )
    result = await cursor.to_list(length=None)
    tag_to_user_id = {d.get('player_tag'): d.get('user_id') for d in result}

    # Validate signup_groups if they exist
    signup_group_to_validate = set()
    for member in payload.members:
        if member.signup_group:
            signup_group_to_validate.add(member.signup_group)

    if signup_group_to_validate:
        # Check if the signup_groups exist in roster_signup_categories
        existing_categories = await mongo.roster_signup_categories.find(
            {
                'server_id': server_id,
                'custom_id': {'$in': list(signup_group_to_validate)},
            }
        ).to_list(length=None)
        existing_category_ids = {p['custom_id'] for p in existing_categories}

        # Reject any signup_groups that don't exist in roster_signup_categories
        invalid_groups = signup_group_to_validate - existing_category_ids
        if invalid_groups:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid signup_group(s): {', '.join(invalid_groups)}",
            )

        # Check if the signup_groups are allowed for this specific roster
        allowed_groups = set(roster.get('allowed_signup_groups', []))
        if allowed_groups:  # Only validate if roster has specific restrictions
            unauthorized_groups = signup_group_to_validate - allowed_groups
            if unauthorized_groups:
                raise HTTPException(
                    status_code=400,
                    detail=f"Signup_group(s) not allowed for this roster: {', '.join(unauthorized_groups)}",
                )

    async for player in coc_client.get_players(player_tags=player_tags):
        if isinstance(player, coc.errors.NotFound):
            # get the player tag out of the error message
            tag = player.message.split(' ')[-1]
            await mongo.rosters.update_one(
                {'custom_id': roster_id},
                {
                    '$pull': {'members': {'tag': tag}},
                    '$set': {'updated_at': pend.now(tz=pend.UTC)},
                },
            )
            removed_count += 1
        elif isinstance(player, coc.Maintenance):
            raise player

        user_id = tag_to_user_id.get(player.tag)
        alr_found_accounts = user_to_num_accounts.get(user_id, 0)
        if alr_found_accounts > roster.get('max_accounts_per_user'):
            continue
        if user_id not in user_to_num_accounts:
            user_to_num_accounts[user_id] = 0
        user_to_num_accounts[user_id] += 1

        hero_lvs = sum(
            hero.level for hero in player.heroes if hero.is_home_base
        )
        current_clan = player.clan.name if player.clan else 'No Clan'
        current_clan_tag = player.clan.tag if player.clan else '#'

        # Calculate enhanced member data
        hitrate = await calculate_player_hitrate(player.tag)
        last_online = await get_player_last_online(player.tag)
        current_league = player.league.name if player.league else 'Unranked'

        member_data = {
            'name': player.name,
            'tag': player.tag,
            'discord': user_id,
            'townhall': player.town_hall,
            'hero_lvs': hero_lvs,
            'current_clan': current_clan,
            'current_clan_tag': current_clan_tag,
            'war_pref': player.war_opted_in,
            'current_league': current_league,
            'trophies': player.trophies,
            'hitrate': hitrate,
            'last_online': last_online,
            'signup_group': payload_mapping.get(player.tag),
            'last_updated': pend.now(tz=pend.UTC).int_timestamp,
            'added_at': pend.now(tz=pend.UTC).int_timestamp,
        }
        members_to_add.append(member_data)

    if not members_to_add:
        return {
            'message': 'No valid members to add',
            'success_count': 0,
            'removed_count': removed_count,
        }

    # Add members to roster
    await mongo.rosters.update_one(
        {'custom_id': roster_id},
        {
            '$push': {'members': {'$each': members_to_add}},
            '$set': {'updated_at': pend.now(tz=pend.UTC)},
        },
    )

    return {
        'message': f'Added {len(members_to_add)} members to roster',
        'items': members_to_add,
        'success_count': success_count,
        'removed_count': removed_count,
    }


@router.delete(
    '/roster/{roster_id}/members/{player_tag}',
    name='Remove Member from Roster',
)
@linkd.ext.fastapi.inject
@check_authentication
async def remove_member_from_roster(
    roster_id: str,
    player_tag: str,
    server_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    player_tag = correct_tag(player_tag)

    res = await mongo.rosters.update_one(
        {'custom_id': roster_id},
        {
            '$pull': {'members': {'tag': player_tag}},
            '$set': {'updated_at': pend.now('UTC')},
        },
    )

    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail='Roster not found')

    return {'message': 'Member removed from roster'}


@router.post('/roster/refresh', name='General Refresh Rosters')
@linkd.ext.fastapi.inject
@check_authentication
async def general_refresh_rosters(
    server_id: int = Query(
        None, description='Refresh all rosters for this server'
    ),
    group_id: str = Query(
        None, description='Refresh all rosters in this group'
    ),
    roster_id: str = Query(None, description='Refresh specific roster'),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    coc_client: CustomClashClient,
):
    """
    General refresh endpoint that can refresh rosters by server_id, group_id, or roster_id.
    Returns all refreshed rosters as a list.
    """

    # Build query filter based on provided parameters
    query_filter = {}
    if roster_id:
        query_filter['custom_id'] = roster_id
    elif group_id:
        query_filter['group_id'] = group_id
    elif server_id:
        query_filter['server_id'] = server_id
    else:
        raise HTTPException(
            status_code=400,
            detail='Must provide server_id, group_id, or roster_id',
        )

    # Find rosters to refresh
    rosters = await mongo.rosters.find(query_filter, {'_id': 0}).to_list(
        length=None
    )
    if not rosters:
        return {
            'message': 'No rosters found to refresh',
            'refreshed_rosters': [],
        }

    refreshed_rosters = []

    for roster in rosters:
        members = roster.get('members', [])
        if not members:
            # Add roster to results but with no changes
            refreshed_rosters.append(
                {
                    'roster_id': roster['custom_id'],
                    'alias': roster.get('alias', 'Unknown'),
                    'message': 'No members to refresh',
                    'updated': 0,
                    'removed': 0,
                }
            )
            continue

        updated_members = []
        updated_count = 0
        removed_count = 0

        # Refresh each member
        for member in members:
            updated_member, action = await refresh_member_data(
                member, coc_client
            )

            if action == 'remove':
                removed_count += 1
            elif action == 'updated':
                updated_members.append(updated_member)
                updated_count += 1
            else:  # no_change
                updated_members.append(updated_member)

        # Update roster in database
        await mongo.rosters.update_one(
            {'custom_id': roster['custom_id']},
            {
                '$set': {
                    'members': updated_members,
                    'updated_at': pend.now(tz=pend.UTC),
                }
            },
        )

        refreshed_rosters.append(
            {
                'roster_id': roster['custom_id'],
                'alias': roster.get('alias', 'Unknown'),
                'message': f'Refreshed: {updated_count} updated, {removed_count} removed',
                'updated': updated_count,
                'removed': removed_count,
            }
        )

    return {
        'message': f'Refreshed {len(refreshed_rosters)} roster(s)',
        'refreshed_rosters': refreshed_rosters,
    }


@router.post('/roster/{roster_id}/clone', name='Clone Roster')
@linkd.ext.fastapi.inject
@check_authentication
async def clone_roster(
    server_id: int,  # Target server ID (destination)
    roster_id: str,  # Source roster ID
    payload: RosterCloneModel,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    coc_client: CustomClashClient,
):
    """Clone an existing roster. It supports same-server and cross-server cloning"""

    # Find the roster to clone
    source_roster = await mongo.rosters.find_one(
        {'custom_id': roster_id}, {'_id': 0}
    )
    if not source_roster:
        raise HTTPException(status_code=404, detail='Source roster not found')

    # Determine if this is a cross-server clone
    is_cross_server = source_roster['server_id'] != server_id

    # Generate new alias for the cloned roster
    if is_cross_server:
        # Cross-server clone: use import-style naming
        new_alias = payload.new_alias or f'Import {roster_id}'
    else:
        # Same-server clone: use clone-style naming
        new_alias = payload.new_alias or f"{source_roster['alias']} (Clone)"

    # Ensure the new alias is unique on target server
    base_alias = new_alias
    counter = 1
    while await mongo.rosters.find_one(
        {'server_id': server_id, 'alias': new_alias}
    ):
        new_alias = f'{base_alias} ({counter})'
        counter += 1

    # Create cloned roster document
    cloned_roster = source_roster.copy()
    cloned_roster.update(
        {
            'custom_id': gen_clean_custom_id(),
            'server_id': server_id,  # Use target server ID from URL parameter
            'alias': new_alias,
            'created_at': pend.now(tz=pend.UTC),
            'updated_at': pend.now(tz=pend.UTC),
            'members': source_roster.get('members', []).copy()
            if payload.copy_members
            else [],
        }
    )

    # Add to group if specified (only works for same-server clones)
    if payload.group_id and not is_cross_server:
        # Verify the group exists on the target server
        group = await mongo.roster_groups.find_one(
            {'group_id': payload.group_id, 'server_id': server_id}
        )
        if group:
            cloned_roster['group_id'] = payload.group_id

    await mongo.rosters.insert_one(cloned_roster)

    # Determine operation type for response message
    operation_type = 'imported' if is_cross_server else 'cloned'

    return {
        'message': f'Roster {operation_type} successfully',
        'new_roster_id': cloned_roster['custom_id'],
        'new_alias': new_alias,
        'target_server_id': server_id,
        'source_server_id': source_roster['server_id'],
        'is_cross_server': is_cross_server,
        'members_copied': len(cloned_roster['members'])
        if payload.copy_members
        else 0,
    }


@router.get('/roster/{server_id}/list', name='List Rosters')
@linkd.ext.fastapi.inject
@check_authentication
async def list_rosters(
    server_id: int,
    group_id: str = None,
    clan_tag: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """List rosters with optional group filtering"""

    # Build MongoDB query dynamically based on provided filters
    query = {'server_id': server_id}  # Always filter by server

    # Optional filters: add to query only if provided
    if group_id:
        query[
            'group_id'
        ] = group_id  # Filter by roster group (e.g., "CWL Season 12")
    if clan_tag:
        query['clan_tag'] = clan_tag  # Filter by specific clan

    cursor = await mongo.rosters.find(query, {'_id': 0}).sort(
        {'updated_at': -1}
    )
    rosters = await cursor.to_list(length=None)

    # Add group information to each roster
    for roster in rosters:
        if roster.get('group_id'):
            group = await mongo.roster_groups.find_one(
                {'group_id': roster['group_id']},
                {'_id': 0, 'alias': 1, 'group_id': 1},
            )
            roster['group_info'] = group

    return {
        'items': rosters,
        'server_id': server_id,
        'group_id': group_id,
        'clan_tag': clan_tag,
    }


@router.delete('/roster/{roster_id}', name='Delete Roster')
@linkd.ext.fastapi.inject
@check_authentication
async def delete_roster(
    server_id: int,
    roster_id: str,
    members_only: bool = False,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """Delete roster or clear members only"""

    if members_only:
        # Just clear members
        result = await mongo.rosters.update_one(
            {'custom_id': roster_id, 'server_id': server_id},
            {'$set': {'members': [], 'updated_at': pend.now(tz=pend.UTC)}},
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail='Roster not found')

        return {'message': 'Roster members cleared'}

    else:
        # Full deletion
        result = await mongo.rosters.delete_one({'custom_id': roster_id})

        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail='Roster not found')

        return {'message': 'Roster deleted successfully'}


# ======================== ROSTER GROUPS ENDPOINTS ========================


@router.post('/roster-group', name='Create Roster Group')
@linkd.ext.fastapi.inject
@check_authentication
async def create_roster_group(
    server_id: int,
    payload: CreateRosterGroupModel,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """Create a new roster group"""
    group_doc = payload.model_dump()
    group_doc.update(
        {
            'group_id': gen_clean_custom_id(),
            'server_id': server_id,
            'created_at': pend.now(tz=pend.UTC),
            'updated_at': pend.now(tz=pend.UTC),
        }
    )

    await mongo.roster_groups.insert_one(group_doc)
    return {
        'message': 'Roster group created successfully',
        'group_id': group_doc['group_id'],
    }


@router.get('/roster-group/{group_id}', name='Get Roster Group')
@linkd.ext.fastapi.inject
@check_authentication
async def get_roster_group(
    server_id: int,
    group_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """Get roster group details with associated rosters"""
    group = await mongo.roster_groups.find_one(
        {'group_id': group_id, 'server_id': server_id}, {'_id': 0}
    )
    if not group:
        raise HTTPException(status_code=404, detail='Roster group not found')

    # Get rosters that belong to this group
    cursor = await mongo.rosters.find(
        {'group_id': group_id},
        {
            '_id': 0,
            'custom_id': 1,
            'alias': 1,
            'clan_name': 1,
            'updated_at': 1,
        },
    )
    rosters = await cursor.to_list(length=None)

    group['rosters'] = rosters
    return {'group': group}


@router.patch('/roster-group/{group_id}', name='Update Roster Group')
@linkd.ext.fastapi.inject
@check_authentication
async def update_roster_group(
    server_id: int,
    group_id: str,
    payload: UpdateRosterGroupModel,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """Update roster group settings"""
    body = payload.model_dump(exclude_none=True)
    if not body:
        return {'message': 'Nothing to update'}

    body['updated_at'] = pend.now(tz=pend.UTC)

    result = await mongo.roster_groups.find_one_and_update(
        {'group_id': group_id, 'server_id': server_id},
        {'$set': body},
        projection={'_id': 0},
        return_document=pymongo.ReturnDocument.AFTER,
    )

    if not result:
        raise HTTPException(status_code=404, detail='Roster group not found')

    return {'message': 'Roster group updated', 'group': result}


@router.get('/roster-group/list', name='List Roster Groups')
@linkd.ext.fastapi.inject
@check_authentication
async def list_roster_groups(
    server_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """List all roster groups for a server"""
    cursor = await mongo.roster_groups.find(
        {'server_id': server_id}, {'_id': 0}
    ).sort({'updated_at': -1})
    groups = await cursor.to_list(length=None)

    # Add roster count for each group by counting rosters with matching group_id
    for group in groups:
        roster_count = await mongo.rosters.count_documents(
            {'group_id': group['group_id']}
        )
        group['roster_count'] = roster_count

    return {'items': groups, 'server_id': server_id}


@router.delete('/roster-group/{group_id}', name='Delete Roster Group')
@linkd.ext.fastapi.inject
@check_authentication
async def delete_roster_group(
    server_id: int,
    group_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """Delete a roster group (rosters remain but lose group association)"""
    group = await mongo.roster_groups.find_one({'group_id': group_id})
    if not group:
        raise HTTPException(status_code=404, detail='Roster group not found')

    # Remove group_id from associated rosters
    result = await mongo.rosters.update_many(
        {'group_id': group_id},
        {
            '$unset': {'group_id': ''},
            '$set': {'updated_at': pend.now(tz=pend.UTC)},
        },
    )
    affected_rosters = result.modified_count

    # Delete the group
    await mongo.roster_groups.delete_one({'group_id': group_id})

    return {
        'message': 'Roster group deleted successfully',
        'affected_rosters': affected_rosters,
    }


# ======================== ROSTER PLACEMENTS ENDPOINTS ========================


@router.post('/roster-signup-category', name='Create Roster Signup Category')
@linkd.ext.fastapi.inject
@check_authentication
async def create_roster_placement(
    payload: CreateRosterSignupCategoryModel,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """Create a new roster signup category category"""

    # Check if placement already exists
    existing = await mongo.roster_signup_categories.find_one(
        {'server_id': payload.server_id, 'custom_id': payload.custom_id}
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail='Signup category with this custom_id already exists',
        )

    placement_doc = payload.model_dump()
    placement_doc.update(
        {
            'created_at': pend.now(tz=pend.UTC),
            'updated_at': pend.now(tz=pend.UTC),
        }
    )

    await mongo.roster_signup_categories.insert_one(placement_doc)
    return {'message': 'Roster placement created successfully'}


@router.get(
    '/roster-signup-category/list', name='List Roster Signup Categorys'
)
@linkd.ext.fastapi.inject
@check_authentication
async def list_roster_signup_categories(
    server_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """List all roster signup categorys for a server"""
    cursor = await mongo.roster_signup_categories.find(
        {'server_id': server_id}, {'_id': 0}
    ).sort({'custom_id': 1})
    placements = await cursor.to_list(length=None)

    return {'items': placements, 'server_id': server_id}


@router.patch(
    '/roster-signup-category/{custom_id}', name='Update Roster Signup Category'
)
@linkd.ext.fastapi.inject
@check_authentication
async def update_roster_placement(
    server_id: int,
    custom_id: str,
    payload: UpdateRosterSignupCategoryModel,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """Update roster signup category"""
    body = payload.model_dump(exclude_none=True)
    if not body:
        return {'message': 'Nothing to update'}

    body['updated_at'] = pend.now(tz=pend.UTC)

    result = await mongo.roster_signup_categories.update_one(
        {'server_id': server_id, 'custom_id': custom_id}, {'$set': body}
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404, detail='Roster placement not found'
        )

    return {'message': 'Roster placement updated'}


@router.delete(
    '/roster-signup-category/{custom_id}', name='Delete Roster Signup Category'
)
@linkd.ext.fastapi.inject
@check_authentication
async def delete_roster_placement(
    server_id: int,
    custom_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """Delete roster signup category (sets members' group field to null)"""

    # First, update all roster members that use this placement
    await mongo.rosters.update_many(
        {'server_id': server_id, 'members.group': custom_id},
        {
            '$set': {
                'members.$[elem].group': None,
                'updated_at': pend.now(tz=pend.UTC),
            }
        },
        array_filters=[{'elem.group': custom_id}],
    )

    # Delete the placement
    result = await mongo.roster_signup_categories.delete_one(
        {'server_id': server_id, 'custom_id': custom_id}
    )

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404, detail='Roster placement not found'
        )

    return {'message': 'Roster placement deleted and member groups updated'}


# ======================== ROSTER MEMBER MANAGEMENT ========================


@router.post('/roster/{roster_id}/members', name='Manage Roster Members')
@linkd.ext.fastapi.inject
@check_authentication
async def manage_roster_members(
    server_id: int,
    roster_id: str,
    payload: RosterMemberBulkOperationModel,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    coc_client: CustomClashClient,
):
    """Add and/or remove members from roster - supports bulk operations"""

    roster = await mongo.rosters.find_one({'custom_id': roster_id})
    if not roster:
        raise HTTPException(status_code=404, detail='Roster not found')

    added_members = []
    removed_tags = []
    success_count = 0
    error_count = 0

    # Handle removals first
    if payload.remove:
        remove_tags = [correct_tag(tag) for tag in payload.remove]
        result = await mongo.rosters.update_one(
            {'custom_id': roster_id},
            {
                '$pull': {'members': {'tag': {'$in': remove_tags}}},
                '$set': {'updated_at': pend.now(tz=pend.UTC)},
            },
        )
        removed_tags = remove_tags

    # Handle additions
    if payload.add:
        existing_members = roster.get('members', [])
        existing_tags = {member['tag'] for member in existing_members}

        # Validate signup_groups if they exist
        signup_group_to_validate = set()
        for member in payload.add:
            if member.signup_group:
                signup_group_to_validate.add(member.signup_group)

        if signup_group_to_validate:
            # Check that all signup_groups exist in roster_signup_categories
            existing_categories = await mongo.roster_signup_categories.find(
                {
                    'server_id': server_id,
                    'custom_id': {'$in': list(signup_group_to_validate)},
                }
            ).to_list(length=None)
            existing_category_ids = {
                p['custom_id'] for p in existing_categories
            }

            invalid_groups = signup_group_to_validate - existing_category_ids
            if invalid_groups:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid signup_group(s): {', '.join(invalid_groups)}",
                )

            # Check that all signup_groups are allowed in this roster
            allowed_groups = set(roster.get('allowed_signup_groups', []))
            if allowed_groups:  # Only validate if roster has restrictions
                unauthorized_groups = signup_group_to_validate - allowed_groups
                if unauthorized_groups:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Signup_group(s) not allowed for this roster: {', '.join(unauthorized_groups)}",
                    )

        # Get user account mappings for limit checking
        add_tags = [
            member.tag
            for member in payload.add
            if correct_tag(member.tag) not in existing_tags
        ]

        if add_tags:
            cursor = await mongo.coc_accounts.find(
                {'player_tag': {'$in': add_tags}}
            )
            tag_to_user_id = {
                doc['player_tag']: doc['user_id']
                for doc in await cursor.to_list(length=None)
            }

            # Get current user account counts
            pipeline = [
                {'$match': {'custom_id': roster_id}},
                {'$unwind': '$members'},
                {'$group': {'_id': '$members.discord', 'count': {'$sum': 1}}},
            ]
            cursor = await mongo.rosters.aggregate(pipeline)
            user_to_count = {
                doc['_id']: doc['count']
                for doc in await cursor.to_list(length=None)
            }

            # Fetch and process players
            async for player in coc_client.get_players(player_tags=add_tags):
                if isinstance(player, coc.errors.NotFound):
                    error_count += 1
                    continue
                elif isinstance(player, coc.Maintenance):
                    raise player

                # Check account limits
                user_id = tag_to_user_id.get(player.tag, 'No User')
                current_count = user_to_count.get(user_id, 0)
                max_accounts = roster.get('max_accounts_per_user')

                if (
                    max_accounts
                    and current_count >= max_accounts
                    and user_id != 'No User'
                ):
                    error_count += 1
                    continue

                # Find the original member request for group assignment
                original_member = next(
                    (
                        m
                        for m in payload.add
                        if correct_tag(m.tag) == player.tag
                    ),
                    None,
                )

                hero_lvs = sum(
                    hero.level for hero in player.heroes if hero.is_home_base
                )
                current_clan = player.clan.name if player.clan else 'No Clan'
                current_clan_tag = player.clan.tag if player.clan else '#'

                # Calculate enhanced member data
                hitrate = await calculate_player_hitrate(player.tag)
                last_online = await get_player_last_online(player.tag)
                current_league = (
                    player.league.name if player.league else 'Unranked'
                )

                member_data = {
                    'name': player.name,
                    'tag': player.tag,
                    'hero_lvs': hero_lvs,
                    'townhall': player.town_hall,
                    'discord': user_id,
                    'current_clan': current_clan,
                    'current_clan_tag': current_clan_tag,
                    'war_pref': player.war_opted_in,
                    'trophies': player.trophies,
                    'signup_group': original_member.signup_group
                    if original_member
                    else None,
                    'hitrate': hitrate,
                    'last_online': last_online,
                    'current_league': current_league,
                    'last_updated': pend.now(tz=pend.UTC).int_timestamp,
                    'added_at': pend.now(tz=pend.UTC).int_timestamp,
                    'member_status': 'active',
                }

                added_members.append(member_data)
                if user_id != 'No User':
                    user_to_count[user_id] = user_to_count.get(user_id, 0) + 1
                success_count += 1

            # Add members to roster
            if added_members:
                await mongo.rosters.update_one(
                    {'custom_id': roster_id},
                    {
                        '$push': {'members': {'$each': added_members}},
                        '$set': {'updated_at': pend.now(tz=pend.UTC)},
                    },
                )

    return {
        'message': f'Added {success_count} members, removed {len(removed_tags)} members',
        'added': added_members,
        'removed': removed_tags,
        'success_count': success_count,
        'error_count': error_count,
    }


# ======================== ROSTER AUTOMATION ENDPOINTS ========================


@router.post('/roster-automation', name='Create Roster Automation')
@linkd.ext.fastapi.inject
@check_authentication
async def create_roster_automation(
    payload: CreateRosterAutomationModel,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """Create a new roster automation rule"""

    # Validate that either roster_id or group_id is provided
    if not payload.roster_id and not payload.group_id:
        raise HTTPException(
            status_code=400, detail='Must specify either roster_id or group_id'
        )

    # Validate roster/group exists
    if payload.roster_id:
        roster = await mongo.rosters.find_one({'custom_id': payload.roster_id})
        if not roster:
            raise HTTPException(status_code=404, detail='Roster not found')

    if payload.group_id:
        group = await mongo.roster_groups.find_one(
            {'group_id': payload.group_id}
        )
        if not group:
            raise HTTPException(
                status_code=404, detail='Roster group not found'
            )

    automation_doc = payload.model_dump()
    automation_doc.update(
        {
            'automation_id': gen_clean_custom_id(),
            'active': True,
            'executed': False,
            'created_at': pend.now(tz=pend.UTC),
            'updated_at': pend.now(tz=pend.UTC),
        }
    )

    await mongo.roster_automation.insert_one(automation_doc)
    return {
        'message': 'Roster automation created successfully',
        'automation_id': automation_doc['automation_id'],
    }


@router.get('/roster-automation/list', name='List Roster Automation Rules')
@linkd.ext.fastapi.inject
@check_authentication
async def list_roster_automation(
    server_id: int,
    roster_id: str = None,
    group_id: str = None,
    active_only: bool = True,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """List roster automation rules"""
    query = {'server_id': server_id}

    if roster_id:
        query['roster_id'] = roster_id
    if group_id:
        query['group_id'] = group_id
    if active_only:
        query['active'] = True
        query['executed'] = False

    cursor = await mongo.roster_automation.find(query, {'_id': 0}).sort(
        {'scheduled_time': 1}
    )
    automations = await cursor.to_list(length=None)

    return {
        'items': automations,
        'server_id': server_id,
        'roster_id': roster_id,
        'group_id': group_id,
    }


@router.patch(
    '/roster-automation/{automation_id}', name='Update Roster Automation'
)
@linkd.ext.fastapi.inject
@check_authentication
async def update_roster_automation(
    server_id: int,
    automation_id: str,
    payload: UpdateRosterAutomationModel,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """Update roster automation rule"""
    body = payload.model_dump(exclude_none=True)
    if not body:
        return {'message': 'Nothing to update'}

    body['updated_at'] = pend.now(tz=pend.UTC)

    result = await mongo.roster_automation.update_one(
        {'automation_id': automation_id, 'server_id': server_id},
        {'$set': body},
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404, detail='Automation rule not found'
        )

    return {'message': 'Automation rule updated'}


@router.delete(
    '/roster-automation/{automation_id}', name='Delete Roster Automation'
)
@linkd.ext.fastapi.inject
@check_authentication
async def delete_roster_automation(
    server_id: int,
    automation_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """Delete roster automation rule"""
    result = await mongo.roster_automation.delete_one(
        {'automation_id': automation_id, 'server_id': server_id}
    )

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404, detail='Automation rule not found'
        )

    return {'message': 'Automation rule deleted'}


@router.get('/roster/missing-members', name='Get Missing Members')
@linkd.ext.fastapi.inject
@check_authentication
async def get_missing_members(
    server_id: int,
    roster_id: str = Query(
        None, description='Get missing members for specific roster'
    ),
    group_id: str = Query(
        None, description='Get missing members for all rosters in group'
    ),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    coc_client: CustomClashClient,
):
    """
    Find clan members who are not registered in roster(s).
    Can check a specific roster or all rosters in a group.
    """

    if not roster_id and not group_id:
        raise HTTPException(
            status_code=400, detail='Must provide roster_id or group_id'
        )

    # Build query filter
    query_filter = {'server_id': server_id}
    if roster_id:
        query_filter['custom_id'] = roster_id
    elif group_id:
        query_filter['group_id'] = group_id

    # Find rosters to check
    rosters = await mongo.rosters.find(query_filter, {'_id': 0}).to_list(
        length=None
    )
    if not rosters:
        raise HTTPException(status_code=404, detail='No rosters found')

    results = []

    for roster in rosters:
        # Get registered player tags in this roster
        registered_tags = {
            member['tag'] for member in roster.get('members', [])
        }

        try:
            # Get all members from the roster's clan
            clan = await coc_client.get_clan(roster['clan_tag'])
            missing_members = []

            for member in clan.members:
                if member.tag not in registered_tags:
                    missing_members.append(
                        {
                            'tag': member.tag,
                            'name': member.name,
                            'townhall': member.town_hall,
                            'role': member.role.name
                            if member.role
                            else 'Member',
                            'trophies': member.trophies,
                            'discord': 'No User',  # Would need Discord linking to populate
                        }
                    )

            results.append(
                {
                    'state': 'ok',
                    'roster_info': {
                        'roster_id': roster['custom_id'],
                        'alias': roster['alias'],
                        'clan_tag': roster['clan_tag'],
                        'clan_name': roster['clan_name'],
                        'group_id': roster.get('group_id'),
                        'registered_count': len(registered_tags),
                    },
                    'missing_members': missing_members,
                    'summary': {
                        'total_missing': len(missing_members),
                        'total_clan_members': len(clan.members),
                        'coverage_percentage': round(
                            (len(registered_tags) / max(len(clan.members), 1))
                            * 100,
                            2,
                        ),
                    },
                }
            )

        except Exception as e:
            # Add error info but continue with other rosters
            results.append(
                {
                    'state': 'error',
                    'error_message': f'Error fetching clan data: {str(e)}',
                    'roster_info': {
                        'roster_id': roster['custom_id'],
                        'alias': roster['alias'],
                        'clan_tag': roster['clan_tag'],
                        'clan_name': roster.get('clan_name', 'Unknown'),
                        'group_id': roster.get('group_id'),
                        'registered_count': len(registered_tags),
                    },
                    'missing_members': [],
                    'summary': {
                        'total_missing': 0,
                        'total_clan_members': 0,
                        'coverage_percentage': 0,
                    },
                }
            )

    return {
        'query_type': 'roster' if roster_id else 'group',
        'query_value': roster_id or group_id,
        'server_id': server_id,
        'results': results,
        'total_rosters_checked': len(results),
    }


@router.post('/roster/{roster_id}/token', name='Generate Roster Access Token')
@linkd.ext.fastapi.inject
@check_authentication
async def generate_roster_token(
    server_id: int,
    roster_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """
    Generate a temporary access token for roster dashboard access.
    Token expires in 1 hour and allows read/write access to the specific roster.
    """

    # Verify roster exists and belongs to server
    roster = await mongo.rosters.find_one(
        {'custom_id': roster_id, 'server_id': server_id},
        {'_id': 0, 'alias': 1, 'clan_name': 1},
    )
    if not roster:
        raise HTTPException(status_code=404, detail='Roster not found')

    # Generate token with roster-specific data
    token_info = await generate_access_token(
        server_id=server_id,
        token_type='roster',
        expires_hours=1,
        roster_id=roster_id,  # Additional data for token
        alias=roster.get('alias', 'Unknown'),
        clan_name=roster.get('clan_name', 'Unknown'),
    )

    return {
        'message': 'Roster access token generated successfully',
        'roster_info': {
            'roster_id': roster_id,
            'alias': roster.get('alias', 'Unknown'),
            'clan_name': roster.get('clan_name', 'Unknown'),
        },
        'access_token': token_info['token'],
        'dashboard_url': token_info['dashboard_url'],
        'expires_at': token_info['expires_at'].isoformat(),
        'expires_in_hours': 1,
    }
