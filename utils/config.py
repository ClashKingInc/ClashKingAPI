from os import getenv
from dataclasses import dataclass
import os
from dotenv import load_dotenv
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from cryptography.fernet import Fernet

load_dotenv()

@dataclass(frozen=True, slots=True)
class Config:
    coc_email = getenv("COC_EMAIL")
    coc_password = getenv("COC_PASSWORD")

    static_mongodb = getenv("STATIC_MONGODB")
    stats_mongodb = getenv("STATS_MONGODB")
    
    min_coc_email = 1
    max_coc_email = 10
    
    redis_ip = getenv("REDIS_IP")
    redis_pw = getenv("REDIS_PW")

    bunny_api_token = getenv("BUNNY_ACCESS_KEY")
    analytics_token = getenv("API_ANALYTICS_KEY")

    link_api_username = getenv("LINK_API_USER")
    link_api_password = getenv("LINK_API_PW")

    internal_api_token = getenv("INTERNAL_API_TOKEN")

    client_secret = getenv("CLIENT_SECRET")
    bot_token = getenv("BOT_TOKEN")

    ENV = os.getenv("APP_ENV", "local")
    IS_LOCAL = ENV == "local"
    IS_DEV = ENV == "development"
    IS_PROD = ENV == "production"

    HOST = "localhost" if IS_LOCAL else "0.0.0.0"
    PORT = 8000 if IS_LOCAL else (8073 if IS_DEV else 8010)
    RELOAD = IS_LOCAL or IS_DEV

    SECRET_KEY = os.getenv('SECRET_KEY')
    REFRESH_SECRET = os.getenv('REFRESH_SECRET')
    DISCORD_CLIENT_ID = os.getenv('DISCORD_CLIENT_ID')
    DISCORD_CLIENT_SECRET = os.getenv('DISCORD_CLIENT_SECRET')
    DISCORD_REDIRECT_URI = os.getenv('DISCORD_REDIRECT_URI')
    ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY')
    SENTRY_DSN = os.getenv('SENTRY_DSN')
    APP_SENTRY_DSN = os.getenv('APP_SENTRY_DSN')
    DISCORDCOC_LOGIN = os.getenv('DISCORDCOC_LOGIN')
    DISCORDCOC_PASSWORD = os.getenv('DISCORDCOC_PASSWORD')
    ALGORITHM = "HS256"
    
    # Email configuration
    SMTP_SERVER = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
    SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
    SMTP_USERNAME = os.getenv('SMTP_USERNAME')
    SMTP_PASSWORD = os.getenv('SMTP_PASSWORD')
    SMTP_FROM = os.getenv('SMTP_FROM')
    SMTP_STARTTLS = os.getenv('SMTP_STARTTLS', 'true').lower() == 'true'
    SMTP_SSL_TLS = os.getenv('SMTP_SSL_TLS', 'false').lower() == 'true'
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')

    # Encryption/Decryption/Hashing/Token
    cipher = Fernet(ENCRYPTION_KEY)
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


