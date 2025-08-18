import re
from fastapi import HTTPException


class PasswordValidator:
    """Password strength validation utility."""

    MIN_LENGTH = 8
    MAX_LENGTH = 128

    @staticmethod
    def validate_password(password: str) -> None:
        """
        Validate password strength according to security policy.

        Requirements:
        - 8-128 characters long
        - At least one lowercase letter
        - At least one uppercase letter
        - At least one digit
        - At least one special character
        - No common weak patterns
        """
        if not password:
            raise HTTPException(status_code=400, detail="Password is required")

        if len(password) < PasswordValidator.MIN_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"Password must be at least {PasswordValidator.MIN_LENGTH} characters long"
            )

        if len(password) > PasswordValidator.MAX_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"Password must be no more than {PasswordValidator.MAX_LENGTH} characters long"
            )

        # Check for required character types
        if not re.search(r'[a-z]', password):
            raise HTTPException(
                status_code=400,
                detail="Password must contain at least one lowercase letter"
            )

        if not re.search(r'[A-Z]', password):
            raise HTTPException(
                status_code=400,
                detail="Password must contain at least one uppercase letter"
            )

        if not re.search(r'\d', password):
            raise HTTPException(
                status_code=400,
                detail="Password must contain at least one digit"
            )

        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
            raise HTTPException(
                status_code=400,
                detail="Password must contain at least one special character"
            )

        # Check for common weak patterns
        PasswordValidator._check_weak_patterns(password)

    @staticmethod
    def _check_weak_patterns(password: str) -> None:
        """Check for common weak password patterns."""
        weak_patterns = [
            'password', 'Password', 'PASSWORD',
            '123456', 'qwerty', 'abc123',
            'admin', 'letmein', 'welcome',
            'monkey', 'dragon', 'master'
        ]

        password_lower = password.lower()
        for pattern in weak_patterns:
            if pattern.lower() in password_lower:
                raise HTTPException(
                    status_code=400,
                    detail="Password contains common weak patterns. Please choose a stronger password."
                )

        # Check for repeated characters (more than 3 consecutive)
        if re.search(r'(.)\1{3,}', password):
            raise HTTPException(
                status_code=400,
                detail="Password cannot contain more than 3 consecutive identical characters"
            )

    @staticmethod
    def validate_email(email: str) -> None:
        """Validate email format."""
        if not email:
            raise HTTPException(status_code=400, detail="Email is required")

        # RFC 5322 compliant email regex (simplified)
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, email):
            raise HTTPException(status_code=400, detail="Invalid email format")

        if len(email) > 254:  # RFC 5321 limit
            raise HTTPException(status_code=400, detail="Email address too long")

    @staticmethod
    def validate_username(username: str) -> None:
        """Validate username format."""
        if not username:
            raise HTTPException(status_code=400, detail="Username is required")

        if len(username) < 3:
            raise HTTPException(status_code=400, detail="Username must be at least 3 characters long")

        if len(username) > 30:
            raise HTTPException(status_code=400, detail="Username must be no more than 30 characters long")

        # Allow alphanumeric, underscores, hyphens
        if not re.match(r'^[a-zA-Z0-9_-]+$', username):
            raise HTTPException(
                status_code=400,
                detail="Username can only contain letters, numbers, underscores, and hyphens"
            )