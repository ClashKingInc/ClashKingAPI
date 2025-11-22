"""
Cache decorator for API endpoints to prevent duplicate Discord API calls
"""
import functools
import hashlib
import json
import time
from typing import Any, Callable, Optional

# Simple in-memory cache
_cache: dict[str, tuple[Any, float]] = {}
_DEFAULT_TTL = 30  # 30 seconds


def cache_endpoint(ttl: int = _DEFAULT_TTL, key_prefix: str = ""):
    """
    Cache decorator for async functions.

    Args:
        ttl: Time to live in seconds
        key_prefix: Prefix for cache key

    Usage:
        @cache_endpoint(ttl=60, key_prefix="channels")
        async def get_channels(server_id: int):
            ...
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key from function name and arguments
            cache_key_parts = [key_prefix or func.__name__]

            # Add positional args to key
            for arg in args:
                if isinstance(arg, (str, int, float, bool)):
                    cache_key_parts.append(str(arg))

            # Add keyword args to key
            for k, v in sorted(kwargs.items()):
                if isinstance(v, (str, int, float, bool)):
                    cache_key_parts.append(f"{k}={v}")

            cache_key = ":".join(cache_key_parts)

            # Check cache
            if cache_key in _cache:
                cached_value, cached_time = _cache[cache_key]
                if time.time() - cached_time < ttl:
                    return cached_value
                else:
                    # Expired, remove from cache
                    del _cache[cache_key]

            # Execute function
            result = await func(*args, **kwargs)

            # Store in cache
            _cache[cache_key] = (result, time.time())

            return result

        return wrapper
    return decorator


def invalidate_cache(pattern: Optional[str] = None):
    """
    Invalidate cache entries.

    Args:
        pattern: If provided, only invalidate keys containing this pattern.
                 If None, clear entire cache.
    """
    if pattern is None:
        _cache.clear()
    else:
        keys_to_delete = [k for k in _cache.keys() if pattern in k]
        for key in keys_to_delete:
            del _cache[key]


def get_cache_stats() -> dict:
    """Get cache statistics."""
    return {
        "size": len(_cache),
        "keys": list(_cache.keys()),
    }
