import coc
import linkd
import pendulum as pend
import pymongo
from coc.utils import correct_tag
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from routers.v2.rosters.roster_models import (CreateRosterAutomationModel,
                                              CreateRosterGroupModel,
                                              CreateRosterModel,
                                              CreateRosterSignupCategoryModel,
                                              RosterCloneModel,
                                              RosterMemberBulkOperationModel,
                                              RosterUpdateModel,
                                              UpdateRosterAutomationModel,
                                              UpdateRosterGroupModel,
                                              UpdateRosterSignupCategoryModel, UpdateMemberModel)
from routers.v2.rosters.roster_utils import (calculate_player_hitrate,
                                             get_player_last_online,
                                             refresh_member_data)
from utils.custom_coc import CustomClashClient
from utils.database import MongoClient
from utils.security import check_authentication
from utils.utils import gen_clean_custom_id, generate_access_token

router = APIRouter(prefix='/v2', tags=['Rosters'], include_in_schema=True)
security = HTTPBearer()


@router.post('/roster', name='Create a roster')
@check_authentication
@linkd.ext.fastapi.inject
async def create_roster(
    server_id: int,
    roster_data: CreateRosterModel,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    coc_client: CustomClashClient,
):
    """
    Create a new roster for a Discord server.

    Input:
        - server_id: Discord server ID where the roster will be created
        - roster_data: Roster configuration (name, type, clan_tag, etc.)
        - credentials: JWT authentication token

    Output:
        - Success message with roster ID
        - HTTP 400 if validation fails
        - HTTP 401 if unauthorized
    """
    # Validate clan selection based on roster organization type
    clan = None
    if roster_data.roster_type == 'clan':
        # Clan-specific rosters require a valid clan tag
        if not roster_data.clan_tag:
            raise HTTPException(
                status_code=400,
                detail="Clan tag is required for clan-specific rosters"
            )

        # Ensure the clan is already linked to this Discord server
        server_clan = await mongo.clans.find_one({
            'tag': roster_data.clan_tag,
            'server': server_id
        })
        if not server_clan:
            raise HTTPException(
                status_code=400,
                detail="Selected clan is not linked to this server"
            )

        # Fetch clan data from Clash of Clans API
        clan = await coc_client.get_clan(tag=roster_data.clan_tag)

    elif roster_data.roster_type == 'family':
        # Family-wide rosters can span multiple clans but may have a primary clan for reference
        if roster_data.clan_tag:
            # If a primary clan is specified, ensure it's linked to the server
            server_clan = await mongo.clans.find_one({
                'tag': roster_data.clan_tag,
                'server': server_id
            })
            if not server_clan:
                raise HTTPException(
                    status_code=400,
                    detail="Selected clan is not linked to this server"
                )
            clan = await coc_client.get_clan(tag=roster_data.clan_tag)

    # Convert roster data to database document
    roster_doc = roster_data.model_dump()
    ext_data = {
        'server_id': server_id,
        'custom_id': gen_clean_custom_id(),  # Generate unique identifier
        'members': [],  # Initialize empty member list
        # Default display settings for roster table
        'columns': ['Townhall Level', 'Name', '30 Day Hitrate', 'Clan Tag'],
        'sort': [],  # No default sorting
        'created_at': pend.now(tz=pend.UTC),
        'updated_at': pend.now(tz=pend.UTC),
    }

    # Add clan metadata if available
    if clan:
        ext_data.update({
            'clan_name': clan.name,
            'clan_tag': clan.tag,
            'clan_badge': clan.badge.large,  # High-res clan badge URL
        })
    else:
        # Handle family rosters without a specific primary clan
        if roster_data.roster_type == 'family':
            ext_data.update({
                'clan_name': f"{roster_data.alias} Family",
                'clan_tag': None,
                'clan_badge': None,
            })
        else:
            # This case should never occur due to validation above
            raise HTTPException(status_code=400, detail="Invalid roster configuration")
    # Merge roster data with additional metadata
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
    """
    Update roster settings including name, clan assignment, and townhall restrictions.

    Input:
        - server_id: Discord server ID for authorization
        - roster_id: Unique roster identifier OR group_id for batch updates
        - payload: Updated roster settings (alias, roster_type, min_th, max_th, etc.)
        - group_id: Optional group ID for updating all rosters in a group

    Output:
        - Updated roster document OR batch update summary
        - HTTP 404 if roster/group not found
        - HTTP 400 if validation fails
    """

    # Extract only fields that were actually provided in the request
    body = payload.model_dump(exclude_none=True)
    if not body:
        return {'message': 'Nothing to update'}

    # Convert user-friendly min_th/max_th to database th_restriction format
    if 'min_th' in body or 'max_th' in body:
        min_th = body.pop('min_th', None)
        max_th = body.pop('max_th', None)

        # Validate TH range
        if min_th is not None and max_th is not None and min_th > max_th:
            raise HTTPException(status_code=400, detail='Minimum TH cannot be greater than Maximum TH')

        # Convert to th_restriction format
        if min_th is not None and max_th is not None:
            if min_th == max_th:
                body['th_restriction'] = str(min_th)
            else:
                body['th_restriction'] = f"{min_th}-{max_th}"
        elif min_th is not None:
            body['th_restriction'] = f"{min_th}+"
        elif max_th is not None:
            body['th_restriction'] = f"1-{max_th}"
        else:
            body['th_restriction'] = None

    # Handle clan_tag and roster_type updates
    if 'roster_type' in body or 'clan_tag' in body:
        current_roster = await mongo.rosters.find_one({
            'custom_id': roster_id,
            'server_id': server_id
        })

        new_roster_type = body.get('roster_type', current_roster.get('roster_type', 'clan'))
        new_clan_tag = body.get('clan_tag', current_roster.get('clan_tag'))

        # Validate based on roster type
        if new_roster_type == 'clan':
            if not new_clan_tag:
                raise HTTPException(
                    status_code=400,
                    detail="Clan tag is required for clan type rosters"
                )

            # Validate that the clan is linked to this server
            server_clan = await mongo.clans.find_one({
                'tag': new_clan_tag,
                'server': server_id
            })
            if not server_clan:
                raise HTTPException(
                    status_code=400,
                    detail="Selected clan is not linked to this server"
                )

            clan = await coc_client.get_clan(tag=new_clan_tag)
            body['clan_name'] = clan.name
            body['clan_tag'] = clan.tag
            body['clan_badge'] = clan.badge.large

        elif new_roster_type == 'family':
            # For family rosters, clear clan-specific fields
            if 'clan_tag' in body and body['clan_tag']:
                raise HTTPException(
                    status_code=400,
                    detail="Family type rosters should not have a specific clan"
                )
            body['clan_tag'] = None
            body['clan_name'] = f"{current_roster.get('alias', 'Family')} Family"
            body['clan_badge'] = None

    body['updated_at'] = pend.now(tz=pend.UTC)

    if roster_id and not group_id:
        # Update single roster - validate server ownership
        result = await mongo.rosters.find_one_and_update(
            {'custom_id': roster_id, 'server_id': server_id},
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
    """
    Retrieve a specific roster by its ID for display in the dashboard.

    Input:
        - server_id: Discord server ID for authorization
        - roster_id: Unique roster identifier
        - credentials: JWT authentication token

    Output:
        - Complete roster document with parsed townhall restrictions
        - HTTP 404 if roster not found
        - HTTP 401 if unauthorized
    """
    # Fetch roster from database with server ownership validation
    doc = await mongo.rosters.find_one({'custom_id': roster_id, 'server_id': server_id}, {'_id': 0})
    if not doc:
        raise HTTPException(status_code=404, detail='Roster not found')

    # Parse th_restriction string format to user-friendly min_th/max_th values for UI display
    def parse_th_restriction(th_restriction):
        """
        Parse townhall restriction string to separate min and max values.

        Formats handled:
        - "12+" -> min_th=12, max_th=None (TH12 and above)
        - "12-15" -> min_th=12, max_th=15 (TH12 to TH15)
        - "1-15" -> min_th=None, max_th=15 (up to TH15, treating 1 as no minimum)
        - "12" -> min_th=12, max_th=12 (exactly TH12)
        """
        if not th_restriction:
            return None, None

        th_restriction = th_restriction.strip()

        if th_restriction.endswith('+'):
            # Format: "12+" indicates minimum TH level with no upper limit
            min_th = int(th_restriction[:-1])
            return min_th, None
        elif '-' in th_restriction:
            # Format: "12-15" indicates TH range
            parts = th_restriction.split('-')
            # Don't show min_th if it's 1 (effectively no minimum restriction)
            min_th = int(parts[0]) if parts[0] != '1' else None
            max_th = int(parts[1])
            return min_th, max_th
        else:
            # Format: "12" indicates exact TH level required
            th = int(th_restriction)
            return th, th

    # Add parsed townhall restriction values to response for easier UI consumption
    doc['min_th'], doc['max_th'] = parse_th_restriction(doc.get('th_restriction'))

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
    """
    Permanently delete a roster and all its member data.

    Input:
        - server_id: Discord server ID for authorization
        - roster_id: Unique roster identifier to delete
        - credentials: JWT authentication token

    Output:
        - Success message confirming deletion
        - HTTP 404 if roster not found
        - HTTP 401 if unauthorized

    Note: This operation is irreversible and will remove all member data
    """
    # Attempt to delete roster with server ownership validation
    res = await mongo.rosters.delete_one({'custom_id': roster_id, 'server_id': server_id})

    # Check if any document was actually deleted
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail='Roster not found')

    return {'message': 'Roster deleted successfully'}



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
    """
    Remove a specific player from a roster by their player tag.

    Input:
        - roster_id: Unique roster identifier
        - player_tag: Clash of Clans player tag to remove (with or without #)
        - server_id: Discord server ID for authorization
        - credentials: JWT authentication token

    Output:
        - Success message confirming member removal
        - HTTP 404 if roster not found
        - HTTP 401 if unauthorized

    Note: Member is removed even if player tag doesn't exist in roster
    """
    # Standardize player tag format (ensures proper # prefix)
    player_tag = correct_tag(player_tag)

    # Remove member from roster's members array using MongoDB $pull operator
    res = await mongo.rosters.update_one(
        {'custom_id': roster_id},
        {
            '$pull': {'members': {'tag': player_tag}},  # Remove member with matching tag
            '$set': {'updated_at': pend.now('UTC')},    # Update roster timestamp
        },
    )

    # Check if roster was found (matched_count > 0 even if no member was removed)
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
    Refresh member data for rosters by updating player stats from Clash of Clans API.

    Input:
        - server_id: Refresh all rosters on this Discord server (optional)
        - group_id: Refresh all rosters in this group (optional)
        - roster_id: Refresh only this specific roster (optional)
        - credentials: JWT authentication token

    Output:
        - Summary of refresh operation with counts of updated/removed members
        - List of all refreshed rosters with individual results
        - HTTP 400 if no filter parameters provided
        - HTTP 401 if unauthorized

    Note: Exactly one of server_id, group_id, or roster_id must be provided
    """

    # Build MongoDB query filter based on the provided scope parameter
    query_filter = {}
    if roster_id:
        # Refresh single roster by ID
        query_filter['custom_id'] = roster_id
    elif group_id:
        # Refresh all rosters belonging to a specific group (e.g., CWL season)
        query_filter['group_id'] = group_id
    elif server_id:
        # Refresh all rosters on a Discord server
        query_filter['server_id'] = server_id
    else:
        # Require at least one filter to prevent accidental mass refreshes
        raise HTTPException(
            status_code=400,
            detail='Must provide server_id, group_id, or roster_id',
        )

    # Find all rosters matching the filter criteria
    rosters = await mongo.rosters.find(query_filter, {'_id': 0}).to_list(
        length=None
    )
    if not rosters:
        return {
            'message': 'No rosters found to refresh',
            'refreshed_rosters': [],
        }

    refreshed_rosters = []

    # Process each roster individually to track results per roster
    for roster in rosters:
        members = roster.get('members', [])
        if not members:
            # Skip empty rosters but include them in the response
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

        # Refresh each member's data from Clash of Clans API
        for member in members:
            # Call utility function to fetch fresh player data and determine action needed
            updated_member, action = await refresh_member_data(
                member, coc_client
            )

            if action == 'remove':
                # Member no longer exists or is invalid - don't include in updated list
                removed_count += 1
            elif action == 'updated':
                # Member data was successfully updated with new information
                updated_members.append(updated_member)
                updated_count += 1
            else:  # action == 'no_change'
                # Member data is current - keep existing data
                updated_members.append(updated_member)

        # Save the refreshed member list back to the database
        await mongo.rosters.update_one(
            {'custom_id': roster['custom_id']},
            {
                '$set': {
                    'members': updated_members,  # Replace entire members array
                    'updated_at': pend.now(tz=pend.UTC),  # Update roster timestamp
                }
            },
        )

        # Track results for this specific roster
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
    """
    Create a copy of an existing roster, supporting both same-server and cross-server cloning.

    Input:
        - server_id: Target Discord server ID where the clone will be created
        - roster_id: Source roster ID to clone from
        - payload: Clone configuration (new_alias, copy_members, group_id)
        - credentials: JWT authentication token

    Output:
        - Details of the newly created roster clone
        - Information about source and target servers
        - Count of members copied (if copy_members=true)
        - HTTP 404 if source roster not found
        - HTTP 401 if unauthorized

    Note: Cross-server clones cannot be added to groups automatically
    """

    # Fetch the source roster that will be cloned
    source_roster = await mongo.rosters.find_one(
        {'custom_id': roster_id}, {'_id': 0}
    )
    if not source_roster:
        raise HTTPException(status_code=404, detail='Source roster not found')

    # Determine if this is a cross-server operation (import) or same-server (clone)
    is_cross_server = source_roster['server_id'] != server_id

    # Generate appropriate alias based on operation type
    if is_cross_server:
        # Cross-server clone: use import-style naming to indicate origin
        new_alias = payload.new_alias or f'Import {roster_id}'
    else:
        # Same-server clone: use clone-style naming to indicate duplication
        new_alias = payload.new_alias or f"{source_roster['alias']} (Clone)"

    # Ensure the new alias is unique on the target server to avoid conflicts
    base_alias = new_alias
    counter = 1
    while await mongo.rosters.find_one(
        {'server_id': server_id, 'alias': new_alias}
    ):
        # Append incrementing number to make alias unique
        new_alias = f'{base_alias} ({counter})'
        counter += 1

    # Create the cloned roster document with updated metadata
    cloned_roster = source_roster.copy()
    cloned_roster.update(
        {
            'custom_id': gen_clean_custom_id(),  # Generate new unique ID
            'server_id': server_id,  # Assign to target server from URL parameter
            'alias': new_alias,  # Use the validated unique alias
            'created_at': pend.now(tz=pend.UTC),  # Set current creation time
            'updated_at': pend.now(tz=pend.UTC),  # Set current update time
            # Conditionally copy members based on user preference
            'members': source_roster.get('members', []).copy()
            if payload.copy_members
            else [],  # Empty members array if not copying
        }
    )

    # Handle group assignment (only possible for same-server clones)
    if payload.group_id and not is_cross_server:
        # Verify the target group exists on the destination server
        group = await mongo.roster_groups.find_one(
            {'group_id': payload.group_id, 'server_id': server_id}
        )
        if group:
            cloned_roster['group_id'] = payload.group_id
        # Note: If group doesn't exist, we silently ignore rather than error

    # Save the new cloned roster to the database
    await mongo.rosters.insert_one(cloned_roster)

    # Determine user-friendly operation name for response
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
    """
    Retrieve a list of rosters for a Discord server with optional filtering.

    Input:
        - server_id: Discord server ID to list rosters for
        - group_id: Optional filter to show only rosters in specific group
        - clan_tag: Optional filter to show only rosters for specific clan
        - credentials: JWT authentication token

    Output:
        - List of rosters with group information enriched
        - Applied filter parameters echoed back
        - Rosters sorted by most recently updated first
        - HTTP 401 if unauthorized

    Note: Returns empty list if no rosters match the criteria
    """

    # Build MongoDB query dynamically based on provided filters
    query = {'server_id': server_id}  # Always filter by server for security

    # Apply optional filters to narrow down results
    if group_id:
        # Filter by roster group (e.g., "CWL Season 12", "War Roster")
        query['group_id'] = group_id
    if clan_tag:
        # Filter by specific clan tag (e.g., show only rosters for one clan)
        query['clan_tag'] = clan_tag

    # Execute query with sorting by most recently updated first
    cursor = await mongo.rosters.find(query, {'_id': 0}).sort(
        {'updated_at': -1}
    )
    rosters = await cursor.to_list(length=None)

    # Enrich each roster with additional group information for display
    for roster in rosters:
        if roster.get('group_id'):
            # Fetch group details to show group name alongside group_id
            group = await mongo.roster_groups.find_one(
                {'group_id': roster['group_id']},
                {'_id': 0, 'alias': 1, 'group_id': 1},  # Only get needed fields
            )
            roster['group_info'] = group  # Add group details to roster object

    return {
        'items': rosters,
        'server_id': server_id,
        'group_id': group_id,  # Echo back applied filters for client reference
        'clan_tag': clan_tag,
    }


@router.delete('/roster/{roster_id}', name='Delete Roster')
@linkd.ext.fastapi.inject
@check_authentication
async def delete_roster_or_members(
    server_id: int,
    roster_id: str,
    members_only: bool = False,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """
    Delete an entire roster or clear only its member list.

    Input:
        - server_id: Discord server ID for authorization
        - roster_id: Unique roster identifier
        - members_only: If true, clear members but keep roster structure
        - credentials: JWT authentication token

    Output:
        - Success message indicating operation performed
        - HTTP 404 if roster not found
        - HTTP 401 if unauthorized

    Note: When members_only=true, roster settings and structure are preserved
    """

    if members_only:
        # Clear all members but preserve roster structure and settings
        result = await mongo.rosters.update_one(
            {'custom_id': roster_id, 'server_id': server_id},
            {
                '$set': {
                    'members': [],  # Empty the members array
                    'updated_at': pend.now(tz=pend.UTC)  # Update timestamp
                }
            },
        )

        # Verify roster exists on this server
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail='Roster not found')

        return {'message': 'Roster members cleared'}

    else:
        # Perform complete roster deletion (irreversible)
        result = await mongo.rosters.delete_one({
            'custom_id': roster_id,
            'server_id': server_id  # Ensure server ownership
        })

        # Check if any roster was actually deleted
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
    """
    Create a new roster group to organize multiple rosters together.

    Input:
        - server_id: Discord server ID where the group will be created
        - payload: Group configuration (alias, description, etc.)
        - credentials: JWT authentication token

    Output:
        - Success message with generated group_id
        - HTTP 401 if unauthorized

    Note: Groups help organize rosters for events like CWL seasons or tournaments
    """
    # Convert payload to database document format
    group_doc = payload.model_dump()

    # Add system-generated fields and metadata
    group_doc.update(
        {
            'group_id': gen_clean_custom_id(),  # Generate unique group identifier
            'server_id': server_id,  # Associate with Discord server
            'created_at': pend.now(tz=pend.UTC),  # Track creation time
            'updated_at': pend.now(tz=pend.UTC),  # Track last modification
        }
    )

    # Save the new group to the database
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
    """
    Retrieve detailed information about a specific roster group including associated rosters.

    Input:
        - server_id: Discord server ID for authorization
        - group_id: Unique group identifier
        - credentials: JWT authentication token

    Output:
        - Complete group document with list of associated rosters
        - HTTP 404 if group not found
        - HTTP 401 if unauthorized

    Note: Includes summary information for each roster in the group
    """
    # Fetch group with server ownership validation
    group = await mongo.roster_groups.find_one(
        {'group_id': group_id, 'server_id': server_id}, {'_id': 0}
    )
    if not group:
        raise HTTPException(status_code=404, detail='Roster group not found')

    # Get all rosters that belong to this group for display
    cursor = await mongo.rosters.find(
        {'group_id': group_id},
        {
            '_id': 0,
            'custom_id': 1,  # Roster identifier
            'alias': 1,      # Roster display name
            'clan_name': 1,  # Associated clan name
            'updated_at': 1, # Last modification time
        },
    )
    rosters = await cursor.to_list(length=None)

    # Add roster list to group data for comprehensive view
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
    """
    Update roster group settings such as alias, description, or other metadata.

    Input:
        - server_id: Discord server ID for authorization
        - group_id: Unique group identifier to update
        - payload: Updated group settings (only provided fields will be changed)
        - credentials: JWT authentication token

    Output:
        - Updated group document
        - HTTP 404 if group not found
        - HTTP 400 if no fields to update
        - HTTP 401 if unauthorized
    """
    # Extract only the fields that were actually provided in the request
    body = payload.model_dump(exclude_none=True)
    if not body:
        return {'message': 'Nothing to update'}

    # Add timestamp to track when the update occurred
    body['updated_at'] = pend.now(tz=pend.UTC)

    # Update group and return the modified document
    result = await mongo.roster_groups.find_one_and_update(
        {'group_id': group_id, 'server_id': server_id},  # Filter with server validation
        {'$set': body},  # Apply the updates
        projection={'_id': 0},  # Exclude MongoDB internal ID
        return_document=pymongo.ReturnDocument.AFTER,  # Return updated document
    )

    # Check if group was found and updated
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
    """
    Retrieve all roster groups for a Discord server with roster counts.

    Input:
        - server_id: Discord server ID to list groups for
        - credentials: JWT authentication token

    Output:
        - List of groups sorted by most recently updated
        - Each group includes count of associated rosters
        - HTTP 401 if unauthorized

    Note: Returns empty list if server has no roster groups
    """
    # Fetch all groups for the server, sorted by most recent activity
    cursor = await mongo.roster_groups.find(
        {'server_id': server_id}, {'_id': 0}
    ).sort({'updated_at': -1})
    groups = await cursor.to_list(length=None)

    # Enrich each group with roster count for better overview
    for group in groups:
        # Count how many rosters are currently assigned to this group
        roster_count = await mongo.rosters.count_documents(
            {'group_id': group['group_id']}
        )
        group['roster_count'] = roster_count  # Add count to group data

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
    """
    Delete a roster group while preserving associated rosters.

    Input:
        - server_id: Discord server ID for authorization
        - group_id: Unique group identifier to delete
        - credentials: JWT authentication token

    Output:
        - Success message with count of rosters that were ungrouped
        - HTTP 404 if group not found
        - HTTP 401 if unauthorized

    Note: Rosters in the group remain but lose their group association
    """
    # Verify group exists before attempting deletion
    group = await mongo.roster_groups.find_one({'group_id': group_id})
    if not group:
        raise HTTPException(status_code=404, detail='Roster group not found')

    # Remove group association from all rosters in this group
    result = await mongo.rosters.update_many(
        {'group_id': group_id},  # Find all rosters in this group
        {
            '$unset': {'group_id': ''},  # Remove the group_id field
            '$set': {'updated_at': pend.now(tz=pend.UTC)},  # Update timestamp
        },
    )
    affected_rosters = result.modified_count

    # Delete the group document itself
    await mongo.roster_groups.delete_one({'group_id': group_id})

    return {
        'message': 'Roster group deleted successfully',
        'affected_rosters': affected_rosters,  # How many rosters were ungrouped
    }


# ======================== ROSTER PLACEMENTS ENDPOINTS ========================


@router.post('/roster-signup-category', name='Create Roster Signup Category')
@linkd.ext.fastapi.inject
@check_authentication
async def create_roster_signup_category(
    payload: CreateRosterSignupCategoryModel,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """
    Create a new signup category for organizing roster members by role or skill level.

    Input:
        - payload: Category configuration (alias, server_id, description, etc.)
        - credentials: JWT authentication token

    Output:
        - Success message confirming category creation
        - HTTP 400 if custom_id already exists or validation fails
        - HTTP 401 if unauthorized

    Note: Categories help organize members (e.g., "Leaders", "TH14+", "War Specialists")
    """

    # Ensure server_id is always an integer for database consistency
    server_id = int(payload.server_id)

    # Generate custom_id automatically if not provided by user
    if not payload.custom_id:
        # Create URL-friendly ID based on category alias
        import re
        base_id = re.sub(r'[^a-z0-9]', '-', payload.alias.lower()).strip('-')
        base_id = re.sub(r'-+', '-', base_id)  # Remove multiple consecutive dashes

        # Ensure uniqueness by checking against existing categories
        counter = 1
        custom_id = base_id
        while True:
            existing = await mongo.roster_signup_categories.find_one(
                {'server_id': server_id, 'custom_id': custom_id}
            )
            if not existing:
                break  # Found unique ID
            counter += 1
            custom_id = f"{base_id}-{counter}"  # Append number to make unique

        payload.custom_id = custom_id
    else:
        # Validate that user-provided custom_id doesn't already exist
        existing = await mongo.roster_signup_categories.find_one(
            {'server_id': server_id, 'custom_id': payload.custom_id}
        )
        if existing:
            raise HTTPException(
                status_code=400,
                detail='Signup category with this custom_id already exists',
            )

    # Convert payload to database document and add metadata
    category_doc = payload.model_dump()
    category_doc['server_id'] = server_id  # Use the validated integer
    category_doc.update(
        {
            'created_at': pend.now(tz=pend.UTC),  # Track creation time
            'updated_at': pend.now(tz=pend.UTC),  # Track last modification
        }
    )

    # Save the new category to the database
    await mongo.roster_signup_categories.insert_one(category_doc)
    return {'message': 'Roster signup category created successfully'}


@router.get(
    '/roster-signup-category/list', name='List Roster Signup Categories'
)
@linkd.ext.fastapi.inject
@check_authentication
async def list_roster_signup_categories(
    server_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """
    Retrieve all signup categories for a Discord server.

    Input:
        - server_id: Discord server ID to list categories for
        - credentials: JWT authentication token

    Output:
        - List of categories sorted by custom_id alphabetically
        - HTTP 401 if unauthorized

    Note: Categories are used to organize members when adding them to rosters
    """
    # Fetch all signup categories for the server, sorted alphabetically
    categories = await mongo.roster_signup_categories.find(
        {'server_id': server_id}, {'_id': 0}
    ).sort({'custom_id': 1}).to_list(length=None)

    return {'items': categories, 'server_id': server_id}


@router.patch(
    '/roster-signup-category/{custom_id}', name='Update Roster Signup Category'
)
@linkd.ext.fastapi.inject
@check_authentication
async def update_roster_signup_category(
    server_id: int,
    custom_id: str,
    payload: UpdateRosterSignupCategoryModel,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """
    Update settings for an existing roster signup category.

    Input:
        - server_id: Discord server ID for authorization
        - custom_id: Category identifier to update
        - payload: Updated category settings (only provided fields will be changed)
        - credentials: JWT authentication token

    Output:
        - Success message confirming update
        - HTTP 404 if category not found
        - HTTP 400 if no fields to update
        - HTTP 401 if unauthorized
    """
    # Extract only the fields that were actually provided in the request
    body = payload.model_dump(exclude_none=True)
    if not body:
        return {'message': 'Nothing to update'}

    # Add timestamp to track when the update occurred
    body['updated_at'] = pend.now(tz=pend.UTC)

    # Update the category with server ownership validation
    result = await mongo.roster_signup_categories.update_one(
        {'server_id': server_id, 'custom_id': custom_id}, {'$set': body}
    )

    # Check if category was found and updated
    if result.matched_count == 0:
        raise HTTPException(
            status_code=404, detail='Roster signup category not found'
        )

    return {'message': 'Roster signup category updated'}


@router.delete(
    '/roster-signup-category/{custom_id}', name='Delete Roster Signup Category'
)
@linkd.ext.fastapi.inject
@check_authentication
async def delete_roster_signup_category(
    server_id: int,
    custom_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """
    Delete a roster signup category and remove it from all associated members.

    Input:
        - server_id: Discord server ID for authorization
        - custom_id: Category identifier to delete
        - credentials: JWT authentication token

    Output:
        - Success message confirming deletion and member updates
        - HTTP 404 if category not found
        - HTTP 401 if unauthorized

    Note: Members using this category will have their group field set to null
    """

    # First, remove this category from all roster members who are using it
    await mongo.rosters.update_many(
        {'server_id': server_id, 'members.group': custom_id},  # Find rosters with members in this category
        {
            '$set': {
                'members.$[elem].group': None,  # Clear the group assignment
                'updated_at': pend.now(tz=pend.UTC),  # Update roster timestamp
            }
        },
        array_filters=[{'elem.group': custom_id}],  # Target only members with this category
    )

    # Delete the category document itself
    result = await mongo.roster_signup_categories.delete_one(
        {'server_id': server_id, 'custom_id': custom_id}
    )

    # Check if category was found and deleted
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404, detail='Roster signup category not found'
        )

    return {'message': 'Roster signup category deleted and member groups updated'}


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
    """
    Perform bulk operations to add and/or remove members from a roster.

    Input:
        - server_id: Discord server ID for authorization
        - roster_id: Unique roster identifier to modify
        - payload: Bulk operation data (lists of player tags to add/remove)
        - credentials: JWT authentication token

    Output:
        - Summary of operation with counts and details of added/removed members
        - List of successfully added members with full player data
        - Count of errors encountered during processing
        - HTTP 404 if roster not found
        - HTTP 400 if validation fails (invalid signup groups, account limits)
        - HTTP 401 if unauthorized

    Note: Fetches fresh player data from Clash of Clans API for all additions
    """

    # Fetch target roster and validate it exists
    roster = await mongo.rosters.find_one({'custom_id': roster_id})
    if not roster:
        raise HTTPException(status_code=404, detail='Roster not found')

    # Initialize tracking variables for operation results
    added_members = []
    removed_tags = []
    success_count = 0
    error_count = 0

    # Process member removals first (simpler operation)
    if payload.remove:
        # Standardize all player tags to ensure proper format
        remove_tags = [correct_tag(tag) for tag in payload.remove]

        # Remove members from roster using MongoDB pull operation
        result = await mongo.rosters.update_one(
            {'custom_id': roster_id},
            {
                '$pull': {'members': {'tag': {'$in': remove_tags}}},  # Remove matching members
                '$set': {'updated_at': pend.now(tz=pend.UTC)},         # Update timestamp
            },
        )
        removed_tags = remove_tags

    # Process member additions (more complex with validation and API calls)
    if payload.add:
        # Get current roster members to avoid duplicates
        existing_members = roster.get('members', [])
        existing_tags = {member['tag'] for member in existing_members}

        # Validate all signup groups specified in the addition requests
        signup_group_to_validate = set()
        for member in payload.add:
            if member.signup_group:
                signup_group_to_validate.add(member.signup_group)

        if signup_group_to_validate:
            # Verify all specified signup groups exist on this server
            existing_categories = await mongo.roster_signup_categories.find(
                {
                    'server_id': server_id,
                    'custom_id': {'$in': list(signup_group_to_validate)},
                }
            ).to_list(length=None)
            existing_category_ids = {
                category['custom_id'] for category in existing_categories
            }

            # Check for invalid/non-existent signup groups
            invalid_groups = signup_group_to_validate - existing_category_ids
            if invalid_groups:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid signup_group(s): {', '.join(invalid_groups)}",
                )

            # Validate signup groups are allowed for this specific roster
            allowed_groups = set(roster.get('allowed_signup_categories', []))
            if allowed_groups:  # Only validate if roster has category restrictions
                unauthorized_groups = signup_group_to_validate - allowed_groups
                if unauthorized_groups:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Signup_group(s) not allowed for this roster: {', '.join(unauthorized_groups)}",
                    )

        # Filter out players already in roster and get Discord account mappings
        add_tags = [
            member.tag
            for member in payload.add
            if correct_tag(member.tag) not in existing_tags  # Skip duplicates
        ]

        if add_tags:
            # Fetch Discord account linkings for the players being added
            cursor = mongo.coc_accounts.find(
                {'player_tag': {'$in': add_tags}}
            )
            tag_to_user_id = {
                doc['player_tag']: doc['user_id']
                for doc in await cursor.to_list(length=None)
            }

            # Calculate current account counts per Discord user for limit enforcement
            pipeline = [
                {'$match': {'custom_id': roster_id}},  # Target this roster
                {'$unwind': '$members'},                # Flatten members array
                {'$group': {'_id': '$members.discord', 'count': {'$sum': 1}}},  # Count per user
            ]
            cursor = await mongo.rosters.aggregate(pipeline)
            user_to_count = {
                doc['_id']: doc['count']
                for doc in await cursor.to_list(length=None)
            }

            # Fetch fresh player data from Clash of Clans API and process each player
            async for player in coc_client.get_players(player_tags=add_tags):
                # Handle API errors for individual players
                if isinstance(player, coc.errors.NotFound):
                    error_count += 1  # Player doesn't exist
                    continue
                elif isinstance(player, coc.Maintenance):
                    raise player  # API maintenance - fail entire operation

                # Enforce per-user account limits if configured
                user_id = tag_to_user_id.get(player.tag, 'No User')
                current_count = user_to_count.get(user_id, 0)
                max_accounts = roster.get('max_accounts_per_user')

                # Skip player if they would exceed the account limit
                if (
                    max_accounts
                    and current_count >= max_accounts
                    and user_id != 'No User'  # Unlinked accounts don't count toward limits
                ):
                    error_count += 1
                    continue

                # Find the original add request to get signup group assignment
                original_member = next(
                    (
                        m
                        for m in payload.add
                        if correct_tag(m.tag) == player.tag
                    ),
                    None,
                )

                # Calculate player statistics for roster display
                hero_lvs = sum(
                    hero.level for hero in player.heroes if hero.is_home_base
                )
                current_clan = player.clan.name if player.clan else 'No Clan'
                current_clan_tag = player.clan.tag if player.clan else '#'

                # Fetch enhanced player data from utility functions
                hitrate = await calculate_player_hitrate(player.tag)  # War performance
                last_online = await get_player_last_online(player.tag)  # Activity tracking
                current_league = (
                    player.league.name if player.league else 'Unranked'
                )

                # Build comprehensive member data object
                member_data = {
                    'name': player.name,
                    'tag': player.tag,
                    'hero_lvs': hero_lvs,                              # Combined hero levels
                    'townhall': player.town_hall,
                    'discord': user_id,                               # Discord account link
                    'current_clan': current_clan,
                    'current_clan_tag': current_clan_tag,
                    'war_pref': player.war_opted_in,                  # War preference setting
                    'trophies': player.trophies,
                    'signup_group': original_member.signup_group      # Category assignment
                    if original_member
                    else None,
                    'hitrate': hitrate,                               # War hit performance
                    'last_online': last_online,                       # Activity timestamp
                    'current_league': current_league,
                    'last_updated': pend.now(tz=pend.UTC).int_timestamp,  # Data freshness
                    'added_at': pend.now(tz=pend.UTC).int_timestamp,      # Addition time
                    'member_status': 'active',                            # Status flag
                }

                # Add successfully processed member to the list
                added_members.append(member_data)

                # Update user account counter for limit tracking
                if user_id != 'No User':
                    user_to_count[user_id] = user_to_count.get(user_id, 0) + 1

                success_count += 1

            # Bulk add all successfully processed members to the roster
            if added_members:
                await mongo.rosters.update_one(
                    {'custom_id': roster_id},
                    {
                        '$push': {'members': {'$each': added_members}},  # Add all new members
                        '$set': {'updated_at': pend.now(tz=pend.UTC)},   # Update roster timestamp
                    },
                )

    return {
        'message': f'Added {success_count} members, removed {len(removed_tags)} members',
        'added': added_members,
        'removed': removed_tags,
        'success_count': success_count,
        'error_count': error_count,
    }


@router.patch('/roster/{roster_id}/members/{member_tag}', name='Update Individual Member')
@linkd.ext.fastapi.inject
@check_authentication
async def update_roster_member(
    server_id: int,
    roster_id: str,
    member_tag: str,
    payload: UpdateMemberModel,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """
    Update specific properties of an individual roster member.

    Input:
        - server_id: Discord server ID for authorization
        - roster_id: Unique roster identifier
        - member_tag: Clash of Clans player tag of member to update
        - payload: Updated member properties (signup_group, member_status, etc.)
        - credentials: JWT authentication token

    Output:
        - Success message confirming member update
        - HTTP 404 if roster or member not found
        - HTTP 400 if validation fails (invalid signup group)
        - HTTP 401 if unauthorized

    Note: Allows updating signup category assignment and member status flags
    """

    # Validate roster exists and belongs to this server
    roster = await mongo.rosters.find_one({
        'custom_id': roster_id,
        'server_id': server_id
    })
    if not roster:
        raise HTTPException(status_code=404, detail='Roster not found')

    # Validate signup group if being updated
    if payload.signup_group:
        # Check signup category exists on this server
        category_exists = await mongo.roster_signup_categories.find_one({
            'server_id': server_id,
            'custom_id': payload.signup_group
        })
        if not category_exists:
            raise HTTPException(status_code=400, detail='Invalid signup group')

        # Verify signup group is allowed for this specific roster
        allowed_groups = set(roster.get('allowed_signup_categories', []))
        if allowed_groups and payload.signup_group not in allowed_groups:
            raise HTTPException(
                status_code=400,
                detail='Signup group not allowed for this roster'
            )

    # Build update data from provided fields only
    update_data = payload.model_dump(exclude_none=True)

    # Special handling for signup_group to allow explicit None (removes category)
    if hasattr(payload, 'signup_group') and 'signup_group' in payload.model_fields_set:
        update_data['signup_group'] = payload.signup_group

    # Ensure there's actually something to update
    if not update_data:
        return {'message': 'Nothing to update'}

    # Update the specific member using MongoDB positional operator ($)
    result = await mongo.rosters.update_one(
        {
            'custom_id': roster_id,
            'server_id': server_id,
            'members.tag': member_tag  # Find roster containing this member
        },
        {
            '$set': {f'members.$.{k}': v for k, v in update_data.items()}  # Update matched member
        }
    )

    # Check if member was found and updated
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Member not found in roster')

    return {'message': 'Member updated successfully'}


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
    """
    Create a scheduled automation rule for roster operations.

    Input:
        - payload: Automation configuration (action, schedule, target roster/group)
        - credentials: JWT authentication token

    Output:
        - Success message with generated automation_id
        - HTTP 404 if target roster or group not found
        - HTTP 400 if neither roster_id nor group_id provided
        - HTTP 401 if unauthorized

    Note: Automations can target individual rosters or entire groups
    """

    # Validate that at least one target is specified (roster or group)
    if not payload.roster_id and not payload.group_id:
        raise HTTPException(
            status_code=400, detail='Must specify either roster_id or group_id'
        )

    # Validate target roster exists if specified
    if payload.roster_id:
        roster = await mongo.rosters.find_one({'custom_id': payload.roster_id})
        if not roster:
            raise HTTPException(status_code=404, detail='Roster not found')

    # Validate target group exists if specified
    if payload.group_id:
        group = await mongo.roster_groups.find_one(
            {'group_id': payload.group_id}
        )
        if not group:
            raise HTTPException(
                status_code=404, detail='Roster group not found'
            )

    # Create automation document with system-generated fields
    automation_doc = payload.model_dump()
    automation_doc.update(
        {
            'automation_id': gen_clean_custom_id(),  # Unique identifier
            'active': True,                          # Enable by default
            'executed': False,                       # Not yet run
            'created_at': pend.now(tz=pend.UTC),    # Creation timestamp
            'updated_at': pend.now(tz=pend.UTC),    # Last modification
        }
    )

    # Save the automation rule to the database
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
    """
    Retrieve automation rules with optional filtering by roster or group.

    Input:
        - server_id: Discord server ID to list automations for
        - roster_id: Optional filter for specific roster automations
        - group_id: Optional filter for specific group automations
        - active_only: If true, only show pending/active automations
        - credentials: JWT authentication token

    Output:
        - List of automation rules sorted by scheduled execution time
        - Applied filter parameters echoed back
        - HTTP 401 if unauthorized

    Note: Active_only=true excludes completed and disabled automations
    """
    # Build query filter starting with server scope
    query = {'server_id': server_id}

    # Apply optional target filters
    if roster_id:
        query['roster_id'] = roster_id  # Filter to specific roster
    if group_id:
        query['group_id'] = group_id    # Filter to specific group

    # Filter by execution status if requested
    if active_only:
        query['active'] = True      # Only enabled rules
        query['executed'] = False   # Only unexecuted rules

    # Fetch automations sorted by scheduled execution time (earliest first)
    cursor = await mongo.roster_automation.find(query, {'_id': 0}).sort(
        {'scheduled_time': 1}
    )
    automations = await cursor.to_list(length=None)

    return {
        'items': automations,
        'server_id': server_id,
        'roster_id': roster_id,   # Echo back applied filters
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
    """
    Update settings for an existing automation rule.

    Input:
        - server_id: Discord server ID for authorization
        - automation_id: Unique automation identifier to update
        - payload: Updated automation settings (schedule, action, active status)
        - credentials: JWT authentication token

    Output:
        - Success message confirming update
        - HTTP 404 if automation rule not found
        - HTTP 400 if no fields to update
        - HTTP 401 if unauthorized

    Note: Can update schedule, action parameters, or enable/disable rules
    """
    # Extract only the fields that were actually provided in the request
    body = payload.model_dump(exclude_none=True)
    if not body:
        return {'message': 'Nothing to update'}

    # Add timestamp to track when the update occurred
    body['updated_at'] = pend.now(tz=pend.UTC)

    # Update automation rule with server ownership validation
    result = await mongo.roster_automation.update_one(
        {'automation_id': automation_id, 'server_id': server_id},
        {'$set': body},
    )

    # Check if automation rule was found and updated
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
    """
    Permanently delete an automation rule.

    Input:
        - server_id: Discord server ID for authorization
        - automation_id: Unique automation identifier to delete
        - credentials: JWT authentication token

    Output:
        - Success message confirming deletion
        - HTTP 404 if automation rule not found
        - HTTP 401 if unauthorized

    Note: This operation is irreversible and cancels any pending scheduled actions
    """
    # Delete automation rule with server ownership validation
    result = await mongo.roster_automation.delete_one(
        {'automation_id': automation_id, 'server_id': server_id}
    )

    # Check if automation rule was found and deleted
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
    Identify clan members who are not yet registered in roster(s) for recruitment analysis.

    Input:
        - server_id: Discord server ID for authorization
        - roster_id: Check missing members for specific roster (optional)
        - group_id: Check missing members for all rosters in group (optional)
        - credentials: JWT authentication token

    Output:
        - Analysis results for each roster showing missing clan members
        - Coverage percentage and recruitment opportunities
        - Member details for easy roster addition
        - HTTP 404 if no rosters found
        - HTTP 400 if neither roster_id nor group_id provided
        - HTTP 401 if unauthorized

    Note: Helps identify recruitment gaps by comparing clan membership to roster registration
    """

    # Require at least one filter to prevent overly broad searches
    if not roster_id and not group_id:
        raise HTTPException(
            status_code=400, detail='Must provide roster_id or group_id'
        )

    # Build MongoDB query filter based on scope
    query_filter = {'server_id': server_id}
    if roster_id:
        query_filter['custom_id'] = roster_id  # Single roster analysis
    elif group_id:
        query_filter['group_id'] = group_id    # Group-wide analysis

    # Find target rosters for missing member analysis
    rosters = await mongo.rosters.find(query_filter, {'_id': 0}).to_list(
        length=None
    )
    if not rosters:
        raise HTTPException(status_code=404, detail='No rosters found')

    # Process each roster to identify missing clan members
    results = []

    for roster in rosters:
        # Build set of player tags already registered in this roster
        registered_tags = {
            member['tag'] for member in roster.get('members', [])
        }

        try:
            # Fetch current clan member list from Clash of Clans API
            clan = await coc_client.get_clan(roster['clan_tag'])
            missing_members = []

            # Compare clan membership against roster registration
            for member in clan.members:
                if member.tag not in registered_tags:
                    # This clan member is not in the roster - potential recruit
                    missing_members.append(
                        {
                            'tag': member.tag,
                            'name': member.name,
                            'townhall': member.town_hall,
                            'role': member.role.name
                            if member.role
                            else 'Member',
                            'trophies': member.trophies,
                            'discord': 'No User',  # Would need Discord linking lookup to populate
                        }
                    )

            # Calculate roster coverage statistics
            coverage_percentage = round(
                (len(registered_tags) / max(len(clan.members), 1)) * 100,
                2,
            )

            # Add successful analysis result
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
                    'missing_members': missing_members,  # Unregistered clan members
                    'summary': {
                        'total_missing': len(missing_members),
                        'total_clan_members': len(clan.members),
                        'coverage_percentage': coverage_percentage,
                    },
                }
            )

        except Exception as e:
            # Handle API errors gracefully - add error info but continue processing
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
                    'missing_members': [],  # No data due to error
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


@router.get('/roster/server/{server_id}/members', name='Get Server Clan Members')
@linkd.ext.fastapi.inject
@check_authentication
async def get_server_clan_members(
    server_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    coc_client: CustomClashClient,
):
    """
    Retrieve all members from clans linked to a Discord server for roster management.
    
    Input:
        - server_id: Discord server ID to get clan members for
        - credentials: JWT authentication token
        
    Output:
        - List of all clan members from server-linked clans
        - Member details including name, tag, townhall, and clan info
        - Sorted alphabetically by player name
        - HTTP 401 if unauthorized
        
    Note: Used for autocomplete and bulk member selection in roster interfaces
    """
    
    # Fetch all clans that are linked to this Discord server
    server_clans = await mongo.clans.find({
        'server': server_id
    }).to_list(length=None)
    
    # Return empty result if no clans are linked to this server
    if not server_clans:
        return {'members': []}
    
    all_members = []
    
    # Fetch member lists from each linked clan via Clash of Clans API
    for server_clan in server_clans:
        try:
            clan = await coc_client.get_clan(tag=server_clan['tag'])
            
            # Add each clan member to the combined list with full details
            for member in clan.members:
                all_members.append({
                    'name': member.name,
                    'tag': member.tag,
                    'townhall': member.town_hall,
                    'clan_name': clan.name,      # Which clan they belong to
                    'clan_tag': clan.tag,
                    'role': member.role.name if member.role else 'Member'
                })
                
        except Exception as e:
            # Log error but continue with other clans to avoid total failure
            print(f"Error fetching clan {server_clan['tag']}: {e}")
            continue
    
    # Sort members alphabetically by name for easier browsing
    all_members.sort(key=lambda x: x['name'].lower())
    
    return {'members': all_members}


@router.post('/roster-token', name='Generate Server Roster Access Token')
@linkd.ext.fastapi.inject
@check_authentication
async def generate_server_roster_token(
    server_id: int,
    roster_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
):
    """
    Generate a temporary access token for roster dashboard access without requiring full authentication.
    
    Input:
        - server_id: Discord server ID to generate token for
        - roster_id: Optional specific roster to focus dashboard on
        - credentials: JWT authentication token (for initial authorization)
        
    Output:
        - Temporary access token valid for 1 hour
        - Dashboard URL with embedded token and parameters
        - Server information including roster count
        - Token expiration timestamp
        - HTTP 401 if unauthorized
        
    Note: Allows sharing roster management access without full bot permissions
    """

    # Get roster count for server information display
    roster_count = await mongo.rosters.count_documents({'server_id': server_id})
    
    # Generate time-limited access token for roster operations
    token_info = await generate_access_token(
        server_id=server_id,
        token_type='roster',      # Token type for roster dashboard access
        expires_hours=1,         # 1 hour expiration for security
        mongo_client=mongo,
    )

    # Build dashboard URL with appropriate parameters
    if roster_id:
        # Focus on specific roster if provided
        dashboard_url = f"{token_info['dashboard_url']}&server_id={server_id}&roster_id={roster_id}"
    else:
        # General server roster dashboard
        dashboard_url = f"{token_info['dashboard_url']}&server_id={server_id}"

    return {
        'message': 'Server roster access token generated successfully',
        'server_info': {
            'server_id': server_id,
            'roster_count': roster_count,  # How many rosters exist on this server
        },
        'access_url': dashboard_url,                           # Ready-to-use dashboard URL
        'token': token_info['token'],                          # Raw token for API access
        'expires_at': token_info['expires_at'].isoformat(),   # When token expires
    }
