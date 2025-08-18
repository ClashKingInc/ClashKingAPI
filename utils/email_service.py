from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from fastapi_mail.errors import ConnectionErrors
from fastapi import HTTPException
import sentry_sdk
from jinja2 import Template
import os


# Email configuration with validation
def get_email_config():
    return ConnectionConfig(
        MAIL_USERNAME=os.getenv('SMTP_USERNAME'),
        MAIL_PASSWORD=os.getenv('SMTP_PASSWORD'),
        MAIL_FROM=os.getenv('SMTP_FROM'),
        MAIL_PORT=int(os.getenv('SMTP_PORT', '587')),
        MAIL_SERVER=os.getenv('SMTP_SERVER', 'smtp.gmail.com'),
        MAIL_STARTTLS=os.getenv('SMTP_STARTTLS', 'true').lower() == 'true',
        MAIL_SSL_TLS=os.getenv('SMTP_SSL_TLS', 'false').lower() == 'true',
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

