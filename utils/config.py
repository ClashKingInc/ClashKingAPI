from os import getenv
from dotenv import load_dotenv
from dataclasses import dataclass
load_dotenv()

@dataclass(frozen=True, slots=True)
class Config:
    coc_email = getenv("COC_EMAIL")
    coc_password = getenv("COC_PASSWORD")

    static_mongodb = getenv("STATIC_MONGODB")
    stats_mongodb = getenv("STATS_MONGODB")

    redis_ip = getenv("REDIS_IP")
    redis_pw = getenv("REDIS_PW")

    bunny_api_token = getenv("BUNNY_ACCESS_KEY")
    analytics_token = getenv("API_ANALYTICS_KEY")

    link_api_username = getenv("LINK_API_USER")
    link_api_password = getenv("LINK_API_PW")

    internal_api_token = getenv("INTERNAL_API_TOKEN")

    min_coc_email = 1
    max_coc_email = 10

    is_local = (getenv("LOCAL") == "TRUE")