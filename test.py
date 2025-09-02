import aiohttp
import asyncio
import orjson
from asyncio_throttle import Throttler

url = "https://api.clashroyale.com/v1/globaltournaments"
token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiIsImtpZCI6IjI4YTMxOGY3LTAwMDAtYTFlYi03ZmExLTJjNzQzM2M2Y2NhNSJ9.eyJpc3MiOiJzdXBlcmNlbGwiLCJhdWQiOiJzdXBlcmNlbGw6Z2FtZWFwaSIsImp0aSI6IjNiZDZhMzdiLTUwMDQtNGRkYS1hNTY2LTc0ZDJhNjE5NzljNSIsImlhdCI6MTc1NjM5NTc4Niwic3ViIjoiZGV2ZWxvcGVyL2Q5YzVlOGQ1LTNhNWYtMGY4MS1jNDA5LTI3Yjg1ODQwNDc3OSIsInNjb3BlcyI6WyJyb3lhbGUiXSwibGltaXRzIjpbeyJ0aWVyIjoicGFydG5lci9wbGF0aW51bSIsInR5cGUiOiJ0aHJvdHRsaW5nIn0seyJjaWRycyI6WyI0Ny4xODQuMjE2LjYxIl0sInR5cGUiOiJjbGllbnQifV19.t1qmSqzYLnclyOjdYZrvtW6RErK1DlGUPzb7y6U3it3Us8gTLgn5Hb1b16hZpG5wxRoHhvD3JvRWhplIkvKr5g"
total_429s = 0
throttler = Throttler(2000)

async def fetch(session: aiohttp.ClientSession):
    global throttler
    global total_429s
    async with throttler:
        async with session.get(url, headers={"Authorization": f"Bearer {token}"}) as response:
            if response.status == 200:
                data = await response.json()
            else:
                data = await response.text()
                print(data)
                total_429s += 1
    return data

async def tester():
    http_session = aiohttp.ClientSession(json_serialize=orjson.loads)

    tasks = [fetch(session=http_session) for _ in range(1000)]
    await asyncio.gather(*tasks)
    await http_session.close()
    print(total_429s, "429s")



asyncio.run(tester())