import pendulum as pend
from fastapi import APIRouter, Request, HTTPException
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
import linkd.ext.fastapi
from bson import ObjectId
import json
from datetime import datetime

from utils.database import MongoClient, OldMongoClient

router = APIRouter(prefix='/ui', tags=['UI Pages'])
templates = Jinja2Templates(directory="templates")


def convert_objectids(obj):
    """Convert MongoDB ObjectIds and datetime objects to strings for JSON serialization"""
    if obj is None:
        return None
    elif isinstance(obj, ObjectId):
        return str(obj)
    elif isinstance(obj, (datetime, pend.DateTime)):
        return obj.isoformat() if hasattr(obj, 'isoformat') else str(obj)
    elif isinstance(obj, dict):
        return {key: convert_objectids(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_objectids(item) for item in obj]
    else:
        return obj


@router.get("/roster/dashboard", response_class=HTMLResponse)
@linkd.ext.fastapi.inject
async def roster_dashboard(
    request: Request, 
    server_id: int,
    token: str,
    roster_id: str = None,
    *,
    mongo: MongoClient
):
    """Serve the roster management page using token authentication"""
    try:
        # Validate token for server access (not roster-specific)
        token_data = await mongo.tokens_db.find_one({
            'token': token, 
            'type': 'roster',
            'server_id': server_id
        })
        
        if not token_data:
            raise HTTPException(status_code=404, detail="Invalid or expired token")
        
        # Check if token is expired
        expires_at = token_data['expires_at']
        if not hasattr(expires_at, 'tzinfo') or expires_at.tzinfo is None:
            expires_at = pend.instance(expires_at, tz=pend.UTC)
        
        if expires_at < pend.now(tz=pend.UTC):
            raise HTTPException(status_code=404, detail="Token has expired")
        
        # Get all rosters for this server
        all_rosters = list(await mongo.rosters.find({
            'server_id': server_id
        }).to_list(length=None))
        
        # Get the specific roster if roster_id is provided
        current_roster = None
        if roster_id:
            current_roster = await mongo.rosters.find_one({
                'custom_id': roster_id,
                'server_id': server_id
            })
            if not current_roster:
                raise HTTPException(status_code=404, detail="Roster not found")
        elif all_rosters:
            # Default to first roster if no roster_id specified
            current_roster = all_rosters[0]
        
        # Parse th_restriction to min_th/max_th for display
        def parse_th_restriction(th_restriction):
            """Parse th_restriction string to min_th and max_th values"""
            if not th_restriction:
                return None, None
            
            th_restriction = th_restriction.strip()
            
            if th_restriction.endswith('+'):
                # Format: "12+" 
                min_th = int(th_restriction[:-1])
                return min_th, None
            elif '-' in th_restriction:
                # Format: "12-15" or "1-15"
                parts = th_restriction.split('-')
                min_th = int(parts[0]) if parts[0] != '1' else None
                max_th = int(parts[1])
                return min_th, max_th
            else:
                # Format: "12" (exact TH)
                th = int(th_restriction)
                return th, th
        
        # Process th_restriction for current roster
        if current_roster:
            current_roster['min_th'], current_roster['max_th'] = parse_th_restriction(current_roster.get('th_restriction'))
        
        # Process th_restriction for all rosters
        for roster in all_rosters:
            roster['min_th'], roster['max_th'] = parse_th_restriction(roster.get('th_restriction'))
        
        # Get related data
        groups = list(await mongo.roster_groups.find({
            'server_id': server_id
        }).to_list(length=None))
        
        # Try to find categories with both int and string server_id
        categories = list(await mongo.roster_signup_categories.find({
            'server_id': {'$in': [server_id, str(server_id), int(server_id)]}
        }).to_list(length=None))

        # Get clans linked to this server
        server_clans = list(await mongo.clans.find({
            'server': server_id
        }).to_list(length=None))
        
        # Convert ObjectIds to strings for JSON serialization
        current_roster = convert_objectids(current_roster)
        all_rosters = convert_objectids(all_rosters)
        groups = convert_objectids(groups)
        categories = convert_objectids(categories)
        server_clans = convert_objectids(server_clans)
        
        # Convert to JSON strings to handle None values properly
        import json
        current_roster_json = json.dumps(current_roster) if current_roster else 'null'
        all_rosters_json = json.dumps(all_rosters)
        categories_json = json.dumps(categories)
        
        return templates.TemplateResponse("roster_management.html", {
            "request": request,
            "current_roster": current_roster,
            "current_roster_json": current_roster_json,
            "all_rosters": all_rosters,
            "all_rosters_json": all_rosters_json,
            "groups": groups,
            "categories": categories,
            "categories_json": categories_json,
            "server_clans": server_clans,
            "server_id": server_id,
            "roster_id": roster_id
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading roster dashboard: {str(e)}")