"""Sentry utilities for error tracking and monitoring."""
import sentry_sdk
from functools import wraps
from fastapi import HTTPException
from typing import Callable, Any
import inspect


def capture_endpoint_errors(func: Callable) -> Callable:
    """
    Decorator to capture and report errors to Sentry with contextual information.

    Automatically extracts server_id, user_id, and other relevant parameters
    from the endpoint function arguments to provide rich context in Sentry.

    Usage:
        @router.get("/endpoint")
        @capture_endpoint_errors
        async def my_endpoint(server_id: int, user_id: str = None):
            ...
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        # Extract context from function parameters
        sig = inspect.signature(func)
        bound_args = sig.bind_partial(*args, **kwargs)
        bound_args.apply_defaults()

        # Build Sentry context
        context = {}
        tags = {}

        # Common parameters to extract
        if 'server_id' in bound_args.arguments:
            tags['server_id'] = str(bound_args.arguments['server_id'])
        if 'user_id' in bound_args.arguments and bound_args.arguments['user_id']:
            tags['user_id'] = str(bound_args.arguments['user_id'])
        if 'clan_tag' in bound_args.arguments:
            tags['clan_tag'] = bound_args.arguments['clan_tag']
        if 'role_type' in bound_args.arguments:
            tags['role_type'] = bound_args.arguments['role_type']

        # Add function metadata
        tags['endpoint'] = func.__name__
        tags['module'] = func.__module__

        # Set Sentry context
        with sentry_sdk.push_scope() as scope:
            for key, value in tags.items():
                scope.set_tag(key, value)
            scope.set_context("endpoint_args", context)

            try:
                return await func(*args, **kwargs)
            except HTTPException:
                # Don't capture HTTPExceptions (4xx, 5xx) as they're expected
                raise
            except Exception as e:
                # Capture unexpected exceptions with full context
                sentry_sdk.capture_exception(e)
                # Re-raise to let FastAPI handle it
                raise

    return wrapper


def track_performance(operation_name: str) -> Callable:
    """
    Decorator to track performance of operations in Sentry.

    Usage:
        @track_performance("database_query")
        async def fetch_data():
            ...
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            with sentry_sdk.start_transaction(op=operation_name, name=func.__name__):
                return await func(*args, **kwargs)
        return wrapper
    return decorator
