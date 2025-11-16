"""
Discord API utilities for fetching server information.
"""

import aiohttp
from typing import Dict, List, Optional

from utils.config import Config

config = Config()


class DiscordAPI:
    """Discord API client for fetching server information."""

    def __init__(self):
        self.config = config
        self._channels_cache = {}
        self._roles_cache = {}
        self._emojis_cache = {}

    async def get_channels(self, server_id: int, use_cache: bool = True) -> Dict:
        """
        Retrieve Discord channels for a server with write permissions, filtered and sorted for automation use.

        Args:
            server_id: Discord server ID to get channels for
            use_cache: Whether to use cached results if available

        Returns:
            Dict containing:
            - channels: List of all writable channels
            - categorized: Channels grouped by priority (suggested, general, other)
            - total_count: Total number of channels

        Raises:
            aiohttp.ClientError: If Discord API request fails
            Exception: For other errors
        """
        # Check cache first
        if use_cache and server_id in self._channels_cache:
            return self._channels_cache[server_id]

        # Fetch channels from Discord API
        all_channels = await self._fetch_channels_from_api(server_id)

        # Create a map of category IDs to category names
        category_map = {}
        for channel in all_channels:
            if channel.get('type') == 4:  # Category type
                category_map[str(channel['id'])] = channel['name']

        # Filter for text channels and announcement channels that support writing
        writable_channels = []
        for channel in all_channels:
            # Filter for text channels (type 0), announcement channels (type 5), and forum channels (type 15)
            if channel.get('type') in [0, 5, 15]:
                category_id = channel.get('parent_id')
                category_name = category_map.get(str(category_id)) if category_id else None

                # Create display name with category if available
                if category_name:
                    display_name = f"#{channel['name']} ({category_name})"
                    full_display_name = f"{category_name} > #{channel['name']}"
                else:
                    display_name = f"#{channel['name']}"
                    full_display_name = f"#{channel['name']}"

                writable_channels.append({
                    'id': str(channel['id']),
                    'name': channel['name'],
                    'type': channel['type'],
                    'mention': f"<#{channel['id']}>",
                    'display_name': display_name,
                    'full_display_name': full_display_name,
                    'category_id': str(category_id) if category_id else None,
                    'category_name': category_name,
                    'position': channel.get('position', 0)
                })

        # Sort and categorize channels
        categorized_channels = self._categorize_channels(writable_channels)

        result = {
            'channels': writable_channels,
            'categorized': categorized_channels,
            'total_count': len(writable_channels)
        }

        # Cache the result
        self._channels_cache[server_id] = result
        return result

    def _categorize_channels(self, channels: List[Dict]) -> Dict:
        """Sort and categorize channels by priority."""
        def get_channel_priority(channel):
            name = channel['name'].lower()

            # High priority for common automation channels
            if any(keyword in name for keyword in [
                'announce', 'event', 'war', 'raid', 'clan-war', 'notification',
                'news', 'update', 'general', 'main', 'roster', 'signup'
            ]):
                return 1

            # Medium priority for general communication channels
            if any(keyword in name for keyword in [
                'chat', 'discussion', 'talk', 'channel', 'info', 'log'
            ]):
                return 2

            # Lower priority for specialized channels
            if any(keyword in name for keyword in [
                'bot', 'command', 'spam', 'test', 'temp', 'archive', 'old'
            ]):
                return 4

            # Default priority
            return 3

        # Sort by priority first, then by position
        channels.sort(key=lambda ch: (get_channel_priority(ch), ch['position']))

        # Group channels by category for better organization
        categorized_channels = {
            'suggested': [],  # High priority channels
            'general': [],    # Medium priority channels
            'other': []       # Lower priority channels
        }

        for channel in channels:
            priority = get_channel_priority(channel)
            if priority == 1:
                categorized_channels['suggested'].append(channel)
            elif priority in [2, 3]:
                categorized_channels['general'].append(channel)
            else:
                categorized_channels['other'].append(channel)

        return categorized_channels

    async def _fetch_channels_from_api(self, server_id: int) -> List[Dict]:
        """Fetch channels from Discord API."""
        url = f'https://discord.com/api/v10/guilds/{server_id}/channels'
        headers = {
            'Authorization': f'Bot {self.config.bot_token}',
            'Content-Type': 'application/json'
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise aiohttp.ClientError(f'Discord API error {response.status}: {error_text}')

                return await response.json()


    async def get_roles(self, server_id: int, use_cache: bool = True) -> List[Dict]:
        """
        Retrieve Discord roles for a server.

        Args:
            server_id: Discord server ID to get roles for
            use_cache: Whether to use cached results if available

        Returns:
            List of role objects with id, name, and other properties

        Raises:
            aiohttp.ClientError: If Discord API request fails
        """
        # Check cache first
        if use_cache and server_id in self._roles_cache:
            return self._roles_cache[server_id]

        url = f'https://discord.com/api/v10/guilds/{server_id}/roles'
        headers = {
            'Authorization': f'Bot {self.config.bot_token}',
            'Content-Type': 'application/json'
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise aiohttp.ClientError(f'Discord API error {response.status}: {error_text}')

                roles = await response.json()

        # Format roles for easier use
        formatted_roles = []
        for role in roles:
            formatted_roles.append({
                'id': str(role['id']),
                'name': role['name'],
                'color': role['color'],
                'position': role['position'],
                'permissions': role['permissions'],
                'managed': role['managed'],
                'mentionable': role['mentionable']
            })

        # Sort by position (higher position = higher in hierarchy)
        formatted_roles.sort(key=lambda r: r['position'], reverse=True)

        # Cache the result
        self._roles_cache[server_id] = formatted_roles
        return formatted_roles

    async def get_emojis(self, server_id: int, use_cache: bool = True) -> List[Dict]:
        """
        Retrieve Discord emojis for a server.

        Args:
            server_id: Discord server ID to get emojis for
            use_cache: Whether to use cached results if available

        Returns:
            List of emoji objects

        Raises:
            aiohttp.ClientError: If Discord API request fails
        """
        # Check cache first
        if use_cache and server_id in self._emojis_cache:
            return self._emojis_cache[server_id]

        url = f'https://discord.com/api/v10/guilds/{server_id}/emojis'
        headers = {
            'Authorization': f'Bot {self.config.bot_token}',
            'Content-Type': 'application/json'
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise aiohttp.ClientError(f'Discord API error {response.status}: {error_text}')

                emojis = await response.json()

        # Cache the result
        self._emojis_cache[server_id] = emojis
        return emojis

    def clear_cache(self, server_id: Optional[int] = None):
        """
        Clear cached data for a specific server or all servers.

        Args:
            server_id: Server ID to clear cache for, or None to clear all caches
        """
        if server_id is not None:
            self._channels_cache.pop(server_id, None)
            self._roles_cache.pop(server_id, None)
            self._emojis_cache.pop(server_id, None)
        else:
            self._channels_cache.clear()
            self._roles_cache.clear()
            self._emojis_cache.clear()


# Global instance for backwards compatibility and easy access
discord_api = DiscordAPI()


# Backwards compatibility functions
async def get_discord_channels(server_id: int) -> Dict:
    """Backwards compatibility wrapper for the DiscordAPI class."""
    return await discord_api.get_channels(server_id)


async def get_discord_roles(server_id: int) -> List[Dict]:
    """Backwards compatibility wrapper for the DiscordAPI class."""
    return await discord_api.get_roles(server_id)


async def get_discord_emojis(server_id: int) -> List[Dict]:
    """Backwards compatibility wrapper for the DiscordAPI class."""
    return await discord_api.get_emojis(server_id)