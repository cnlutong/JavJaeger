import asyncio

import pytest

from modules.common.http_client import create_http_client
from modules.movies import local_scrape, metadata_scrapers
from modules.movies.schemas import LocalScrapePreviewRequest


@pytest.mark.parametrize("workflow", ["map", "preview", "provider_tests", "single_movie"])
def test_scraper_workflows_share_transport_without_sharing_clients(workflow, tmp_path, monkeypatch):
    clients, transports = [], []

    async def fetch(movie_id, config):
        # Two requests model a provider's search/detail flow without using the network.
        for _ in range(2):
            async with create_http_client(timeout=2) as client:
                clients.append(client)
                transports.append(client._transport)
        return {"id": movie_id, "title": f"Title {movie_id}"}

    monkeypatch.setattr(metadata_scrapers, "fetch_javlibrary_movie_detail", fetch)
    monkeypatch.setattr(metadata_scrapers, "fetch_javdb_movie_detail", fetch)
    monkeypatch.setattr(metadata_scrapers.runtime, "get_scrapers_config", lambda: {
        "priority": ["javlibrary"], "javlibrary": {"enabled": True}, "javdb": {"enabled": True},
    })

    async def run():
        if workflow == "map":
            result = await local_scrape.scrape_movie_metadata_map(["ABP-123", "ABP-124"], 2)
            assert len(result) == 2
        elif workflow == "preview":
            for name in ("ABP-123.mp4", "ABP-124.mp4"):
                (tmp_path / name).write_bytes(b"fixture")
            result = await local_scrape.preview_local_scrape(LocalScrapePreviewRequest(
                directory=str(tmp_path), scrape=True, concurrent=2,
            ))
            assert result["success"]
        elif workflow == "provider_tests":
            result = await metadata_scrapers.test_metadata_scraper_providers({"providers": ["javlibrary", "javdb"]})
            assert result["summary"]["success"] == 2
        else:
            result = await metadata_scrapers.metadata_scraper_service.get_movie_detail("ABP-123")
            assert result["metadata"]["id"] == "ABP-123"

    asyncio.run(run())
    assert len({id(client) for client in clients}) == len(clients)
    assert len({id(transport) for transport in transports}) == 1


def test_batch_failure_drains_other_scrapers_before_returning(monkeypatch):
    async def run():
        started, stopped = asyncio.Event(), asyncio.Event()

        async def scrape(movie_id, source_stem):
            if movie_id == "ABP-123":
                await started.wait()
                raise RuntimeError("fixture failure")
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                stopped.set()

        monkeypatch.setattr(local_scrape, "scrape_movie_metadata", scrape)
        try:
            with pytest.raises(Exception):
                await local_scrape.scrape_movie_metadata_map(["ABP-123", "ABP-124"], 2)
            assert stopped.is_set(), "all children must exit before their transport scope closes"
        finally:
            remaining = [task for task in asyncio.all_tasks() if task is not asyncio.current_task()]
            for task in remaining:
                task.cancel()
            await asyncio.gather(*remaining, return_exceptions=True)

    asyncio.run(run())
