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
        .header h1 { margin: 0; font-size: clamp(18px, 4vw, 24px); line-height: 1.2; word-wrap: break-word; }
        .content { padding: 30px; background: white; text-align: center; }
        .code-box { 
            display: inline-block; 
            padding: 20px 40px; 
            background: #f8f9fa; 
            border: 2px solid #D90709; 
            border-radius: 8px; 
            margin: 30px 0;
            font-family: 'Courier New', monospace;
            font-size: 32px;
            font-weight: bold;
            color: #D90709;
            letter-spacing: 8px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
        .highlight { color: #D90709; font-weight: bold; }
        .warning { background: #fff3cd; border: 1px solid #ffecb3; padding: 15px; border-radius: 4px; margin: 20px 0; color: #856404; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Email Verification</h1>
        </div>
        
        <div class="content">
            <h2>Welcome to <span class="highlight">ClashKing</span>!</h2>
            <p>Hello <strong>{{ username }}</strong>,</p>
            
            <p>Thank you for joining the ClashKing community! To complete your account registration and start tracking your Clash of Clans progress, please verify your email address by entering this verification code in the app:</p>
            
            <div class="code-box">
                {{ verification_code }}
            </div>
            
            <div class="warning">
                <strong>⏰ This verification code will expire in 15 minutes</strong> for security purposes.
            </div>
            
            <p><strong>What's next?</strong> Once verified, you'll be able to:</p>
            <ul style="text-align: left; display: inline-block;">
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

# Email template for password reset with code
PASSWORD_RESET_EMAIL_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Reset Your Password - ClashKing</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: #D90709; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: clamp(18px, 4vw, 24px); line-height: 1.2; word-wrap: break-word; }
        .content { padding: 30px; background: white; text-align: center; }
        .code-box { 
            display: inline-block; 
            padding: 20px 40px; 
            background: #f8f9fa; 
            border: 2px solid #D90709; 
            border-radius: 8px; 
            margin: 30px 0;
            font-family: 'Courier New', monospace;
            font-size: 32px;
            font-weight: bold;
            color: #D90709;
            letter-spacing: 8px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
        .highlight { color: #D90709; font-weight: bold; }
        .warning { background: #fff3cd; border: 1px solid #ffecb3; padding: 15px; border-radius: 4px; margin: 20px 0; color: #856404; }
        .security-note { background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 4px; margin: 20px 0; color: #0c5460; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Password Reset</h1>
        </div>
        
        <div class="content">
            <h2>Reset Your <span class="highlight">ClashKing</span> Password</h2>
            <p>Hello <strong>{{ username }}</strong>,</p>
            
            <p>We received a request to reset your password for your ClashKing account. Use this code in the app to reset your password:</p>
            
            <div class="code-box">
                {{ reset_code }}
            </div>
            
            <div class="warning">
                <strong>⏰ This password reset code will expire in 1 hour</strong> for security purposes.
            </div>
            
            <div class="security-note">
                <strong>🔒 Security Notice:</strong> If you didn't request this password reset, please ignore this email. Your account remains secure and no changes will be made.
            </div>
            
            <p><strong>How to use this code:</strong></p>
            <ol style="text-align: left; display: inline-block;">
                <li>Open the ClashKing app</li>
                <li>Go to "Forgot Password" from the login screen</li>
                <li>Enter your email and the 6-digit code above</li>
                <li>Create your new password</li>
            </ol>
        </div>
        
        <div class="footer">
            <p>This email was sent by ClashKing. If you have any questions, please contact devs@clashk.ing.</p>
        </div>
    </div>
</body>
</html>
"""

async def send_verification_email(email: str, username: str, verification_code: str):
    """Send email verification email to user."""
    try:
        # Render email template with auto-escaping for security
        template = Template(VERIFICATION_EMAIL_TEMPLATE, autoescape=True)
        html_content = template.render(
            username=username,
            verification_code=verification_code
        )
        
        # Create message
        message = MessageSchema(
            subject="Your ClashKing Verification Code",
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


async def send_password_reset_email_with_code(email: str, username: str, reset_code: str):
    """Send password reset email with code to user."""
    try:
        # Render email template with auto-escaping for security
        template = Template(PASSWORD_RESET_EMAIL_TEMPLATE, autoescape=True)
        html_content = template.render(
            username=username,
            reset_code=reset_code
        )
        
        # Create message
        message = MessageSchema(
            subject="Reset Your ClashKing Password",
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
        
        sentry_sdk.capture_message(f"Password reset email sent to {email}", level="info")
        
    except ConnectionErrors as e:
        sentry_sdk.capture_exception(e, tags={"function": "send_password_reset_email_with_code", "email": email})
        raise HTTPException(status_code=500, detail="Failed to send password reset email")
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"function": "send_password_reset_email_with_code", "email": email})
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