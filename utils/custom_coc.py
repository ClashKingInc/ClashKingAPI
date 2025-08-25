from typing import List, Optional, Type

import coc
import pendulum as pend
from aiocache import SimpleMemoryCache, cached
from coc import Clan, ClanWar, Location, Player, WarRound
import asyncio
from typing import AsyncIterator, Iterable, Awaitable, Any

class CustomClashClient(coc.Client):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    async def get_player(
            self,
            player_tag: str,
            cls: Type[Player] = coc.Player,
            cache: bool = True,
            **kwargs
    ) -> Player:
        player_tag = player_tag.split('|')[-1]

        return await super().get_player(player_tag, cls, **kwargs)

    async def get_clan(
            self,
            tag: str,
            cls: Type[Clan] = coc.Clan,
            cache: bool = True,
            **kwargs
    ) -> Clan:
        tag = tag.split('|')[-1]

        return await super().get_clan(tag, cls, **kwargs)


    @cached(ttl=None, cache=SimpleMemoryCache)
    async def search_locations(
        self, *, limit: int = None, before: str = None, after: str = None, cls: Type[Location] = None, **kwargs
    ) -> List[Location]:
        return await super().search_locations(limit=limit, before=before, after=after, cls=cls, **kwargs)

    async def fetch_players(
        self,
        player_tags: list[str],
        cls: Type[Player] = coc.Player,
        **kwargs
    ) -> AsyncIterator[Player]:
        tasks = [self.get_player(player_tag=tag, cls=cls, **kwargs) for tag in player_tags]
        return self._run_tasks_stream(coros=tasks, return_exceptions=True)



    async def fetch_clans(
            self,
            clan_tags: list[str],
            cache: bool = True,
    ):
        pass

    async def _run_tasks_stream(
        self, coros: Iterable[Awaitable[Any]], *, return_exceptions: bool = False
    ) -> AsyncIterator[Any]:

        BATCH_SIZE = 100
        sem = asyncio.Semaphore(BATCH_SIZE)

        async def run_with_sem(coro):
            async with sem:
                try:
                    return await coro
                except Exception as e:
                    if return_exceptions:
                        return e
                    raise

        it = iter(coros)
        in_flight: set[asyncio.Task] = set()

        # Prime up to concurrency
        try:
            for _ in range(BATCH_SIZE):
                try:
                    coro = next(it)
                except StopIteration:
                    break
                in_flight.add(asyncio.create_task(run_with_sem(coro)))

            while in_flight:
                done, in_flight = await asyncio.wait(in_flight, return_when=asyncio.FIRST_COMPLETED)

                # Yield all finished results
                for t in done:
                    yield t.result()  # may be an Exception if return_exceptions=True

                # Refill the window
                for _ in range(len(done)):
                    try:
                        coro = next(it)
                    except StopIteration:
                        break
                    in_flight.add(asyncio.create_task(run_with_sem(coro)))
        finally:
            # If caller breaks early, cancel the rest
            for t in in_flight:
                t.cancel()
            if in_flight:
                await asyncio.gather(*in_flight, return_exceptions=True)
