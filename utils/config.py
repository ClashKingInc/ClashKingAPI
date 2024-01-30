from os import getenv
from dotenv import load_dotenv
from dataclasses import dataclass
load_dotenv()

@dataclass(frozen=True, slots=True)
class Config:
    static_mongodb = getenv("STATIC_MONGODB")
    stats_mongodb = getenv("STATS_MONGODB")
    redis_ip = getenv("REDIS_IP")
    redis_pw = getenv("REDIS_PW")
    bunny_api_token = getenv("BUNNY_ACCESS_KEY")