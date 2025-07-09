from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from fastapi_mail.errors import ConnectionErrors
from fastapi import HTTPException
import sentry_sdk
from utils.utils import config
from jinja2 import Template
from pathlib import Path
import os

# Email configuration with validation
def get_email_config():
    """Get email configuration with validation."""
    if not all([config.SMTP_USERNAME, config.SMTP_PASSWORD, config.SMTP_FROM, config.SMTP_SERVER]):
        raise ValueError("Missing required SMTP configuration. Check environment variables.")
    
    return ConnectionConfig(
        MAIL_USERNAME=config.SMTP_USERNAME,
        MAIL_PASSWORD=config.SMTP_PASSWORD,
        MAIL_FROM=config.SMTP_FROM,
        MAIL_PORT=config.SMTP_PORT,
        MAIL_SERVER=config.SMTP_SERVER,
        MAIL_STARTTLS=config.SMTP_STARTTLS,
        MAIL_SSL_TLS=config.SMTP_SSL_TLS,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True
)

# Email template for verification
VERIFICATION_EMAIL_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Verify Your Email - ClashKing</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: #D90709; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 30px; background: white; }
        .button { 
            display: inline-block; 
            padding: 15px 30px; 
            background: #D90709; 
            color: white; 
            text-decoration: none; 
            border-radius: 6px; 
            margin: 20px 0;
            font-weight: bold;
            box-shadow: 0 2px 5px rgba(217,7,9,0.3);
        }
        .button:hover { background: #B8060A; }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
        .highlight { color: #D90709; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>ClashKing - Email Verification</h1>
        </div>
        
        <div class="content">
            <h2>Welcome to <span class="highlight">ClashKing</span>!</h2>
            <p>Hello <strong>{{ username }}</strong>,</p>
            
            <p>Thank you for joining the ClashKing community! To complete your account registration and start tracking your Clash of Clans progress, please verify your email address.</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="{{ verification_url }}" class="button">Verify My Email Address</a>
            </div>
            
            <p>This verification link will expire in <span class="highlight">24 hours</span> for security purposes.</p>
            
            <p>If the button above doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #f0f0f0; padding: 15px; border-radius: 4px; font-family: monospace; font-size: 14px;">{{ verification_url }}</p>
            
            <p><strong>What's next?</strong> Once verified, you'll be able to:</p>
            <ul>
                <li>Track your Clash of Clans statistics</li>
                <li>View detailed clan analytics</li>
                <li>Monitor war performance</li>
                <li>Access advanced player insights</li>
            </ul>
            
            <p>If you didn't create an account with ClashKing, please ignore this email or contact us for assistance.</p>
        </div>
        
        <div class="footer">
            <p>This email was sent by ClashKing. If you have any questions, please contact devs@clashk.ing.</p>
        </div>
    </div>
</body>
</html>
"""

async def send_verification_email(email: str, username: str, verification_token: str):
    """Send email verification email to user."""
    try:
        # Create verification URL using the same logic as the docs endpoint
        if config.IS_LOCAL:
            base_url = "http://localhost:8000"
        elif config.IS_DEV:
            base_url = "https://dev.api.clashk.ing"
        else:
            base_url = "https://api.clashk.ing"
        
        verification_url = f"{base_url}/v2/app/verify-email?token={verification_token}"
        
        # Render email template with auto-escaping for security
        template = Template(VERIFICATION_EMAIL_TEMPLATE, autoescape=True)
        html_content = template.render(
            username=username,
            verification_url=verification_url
        )
        
        # Create message
        message = MessageSchema(
            subject="Verify Your Email - ClashKing",
            recipients=[email],
            body=html_content,
            subtype="html",
            headers={
                "X-Priority": "1",
                "X-MSMail-Priority": "High",
                "List-Unsubscribe": "<mailto:unsubscribe@clashk.ing>",
                "Reply-To": "noreply@clashk.ing"
            }
        )
        
        # Send email with configuration validation
        conf = get_email_config()
        fm = FastMail(conf)
        await fm.send_message(message)
        
        sentry_sdk.capture_message(f"Verification email sent to {email}", level="info")
        
    except ConnectionErrors as e:
        sentry_sdk.capture_exception(e, tags={"function": "send_verification_email", "email": email})
        raise HTTPException(status_code=500, detail="Failed to send verification email")
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"function": "send_verification_email", "email": email})
        raise HTTPException(status_code=500, detail="Internal server error")


async def cleanup_expired_verifications():
    """Clean up expired email verification tokens."""
    from utils.utils import db_client
    import pendulum as pend
    
    try:
        result = await db_client.app_email_verifications.delete_many({
            "expires_at": {"$lt": pend.now()}
        })
        if result.deleted_count > 0:
            sentry_sdk.capture_message(f"Cleaned up {result.deleted_count} expired verification tokens", level="info")
        return result.deleted_count
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"function": "cleanup_expired_verifications"})
        return 0


async def create_verification_indexes():
    """Create necessary database indexes for email verification collection."""
    from utils.utils import db_client
    
    try:
        # Index for fast lookup by email hash (allow duplicates since we clean up manually)
        try:
            await db_client.app_email_verifications.create_index("email_hash")
        except Exception as e:
            # Index might already exist, that's okay
            sentry_sdk.capture_message(f"Email hash index creation: {str(e)}", level="debug")
        
        # Index for fast lookup by verification token
        try:
            await db_client.app_email_verifications.create_index("verification_token")
        except Exception as e:
            sentry_sdk.capture_message(f"Verification token index creation: {str(e)}", level="debug")
        
        # TTL index for automatic cleanup of expired documents
        try:
            await db_client.app_email_verifications.create_index(
                "expires_at", 
                expireAfterSeconds=0  # MongoDB will delete when expires_at < current time
            )
        except Exception as e:
            sentry_sdk.capture_message(f"TTL index creation: {str(e)}", level="debug")
        
        sentry_sdk.capture_message("Email verification indexes initialization completed", level="info")
    except Exception as e:
        # Don't fail startup if index creation fails
        sentry_sdk.capture_exception(e, tags={"function": "create_verification_indexes"})
        print(f"⚠️  Index creation warning: {e}")


async def get_verification_stats():
    """Get statistics about pending verifications for monitoring."""
    from utils.utils import db_client
    import pendulum as pend
    
    try:
        total_pending = await db_client.app_email_verifications.count_documents({})
        expired_count = await db_client.app_email_verifications.count_documents({
            "expires_at": {"$lt": pend.now()}
        })
        
        return {
            "total_pending": total_pending,
            "expired_count": expired_count,
            "active_count": total_pending - expired_count
        }
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"function": "get_verification_stats"})
        return {"total_pending": 0, "expired_count": 0, "active_count": 0}