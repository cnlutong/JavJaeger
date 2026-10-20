import asyncio
from html import escape
from types import SimpleNamespace

import httpx
import pytest

import cilisousuo_cli
from modules.magnets import service


@pytest.fixture
def source(monkeypatch):
    state = SimpleNamespace(candidates=[], details={}, requests=[], probes=[], require_session=False)
    client = httpx.AsyncClient

    def handle(request):
        state.requests.append(request.url.path)
        if request.url.path == "/search":
            rows = []
            for index, item in enumerate(state.candidates):
                path = item.get("path", f"/hash/{index}.html")
                title = item.get("title", "QA-001")
                rows.append(f'<li class="item"><div class="result-title">{escape(title)}</div>'
                            f'<div class="filename">QA-001.mp4</div><div class="size">{item["size"]}</div>'
                            f'<a class="link" href="{path}">详情</a></li>')
            headers = {"set-cookie": "session=fixture; Path=/"} if state.require_session else {}
            return httpx.Response(200, text="".join(rows), headers=headers)
        if state.require_session and request.headers.get("cookie") != "session=fixture":
            return httpx.Response(403)
        answer = state.details.get(request.url.path, f"magnet:?xt=urn:btih:{request.url.path.split('/')[-1].split('.')[0]}")
        if isinstance(answer, int):
            return httpx.Response(answer)
        return httpx.Response(200, text=f'<input id="input-magnet" value="{escape(answer, quote=True)}">' if answer else "No magnet")

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: client(transport=httpx.MockTransport(handle), **kwargs))
    monkeypatch.setattr(cilisousuo_cli, "_FILTER_ENABLED", True)
    monkeypatch.setattr(cilisousuo_cli, "_ALLOW_COLLECTIONS", False)
    monkeypatch.setattr(cilisousuo_cli, "_ALLOW_4K", True)
    monkeypatch.setattr(service.runtime, "get_magnet_health_config", lambda: {"enabled": False})
    return state


def test_best_of_40_candidates_reads_only_the_search_and_winning_detail(source):
    source.candidates = [{"size": f"{1 + i / 10:.1f} GB"} for i in range(40)]
    result = asyncio.run(service.get_cilisousuo_best_magnet_payload("QA-001"))
    assert result["link"] == "magnet:?xt=urn:btih:39"
    assert source.requests == ["/search", "/hash/39.html"], "returning one winner must not fetch all 40 detail pages"


def test_lazy_detail_keeps_the_search_response_session_cookie(source):
    source.candidates = [{"size": "2 GB"}]
    source.require_session = True
    result = asyncio.run(service.get_cilisousuo_best_magnet_payload("QA-001"))
    assert result and result["link"] == "magnet:?xt=urn:btih:0"
    assert source.requests == ["/search", "/hash/0.html"]


def test_standalone_cli_search_preserves_its_search_detail_session(source):
    source.candidates = [{"size": "2 GB"}]
    source.require_session = True
    results = asyncio.run(cilisousuo_cli.search_cilisousuo("QA-001"))
    assert [result.magnet for result in results] == ["magnet:?xt=urn:btih:0"]
    assert source.requests == ["/search", "/hash/0.html"]


def test_cli_search_does_not_close_a_borrowed_client(source):
    source.candidates = [{"size": "2 GB"}]
    source.require_session = True

    async def exercise():
        async with httpx.AsyncClient() as client:
            results = await cilisousuo_cli.search_cilisousuo("QA-001", resolve_detail=False, client=client)
            assert len(results) == 1 and not client.is_closed
            response = await client.get(results[0].detail_url)
            assert response.status_code == 200
        assert client.is_closed

    asyncio.run(exercise())
    assert source.requests == ["/search", "/hash/0.html"]


def test_subtitle_and_4k_filters_run_before_detail_requests(source):
    source.candidates = [
        {"size": "100 GB", "title": "QA-001 中文字幕 4K"},
        {"size": "9 GB"},
        {"size": "2 GB", "title": "QA-001 中文字幕"},
    ]
    result = asyncio.run(service.get_cilisousuo_best_magnet_payload("QA-001", has_subtitle_filter="true", exclude_4k=True))
    assert result["link"] == "magnet:?xt=urn:btih:2" and result["hasSubtitle"] is True
    assert source.requests == ["/search", "/hash/2.html"]


def test_failures_history_and_health_rejections_continue_past_five_candidates(source, monkeypatch):
    source.candidates = [{"size": f"{10 - i / 10:.1f} GB"} for i in range(7)]
    source.details.update({
        "/hash/0.html": 503, "/hash/1.html": "", "/hash/2.html": "magnet:?xt=urn:btih:history",
        "/hash/3.html": "magnet:?xt=urn:btih:low", "/hash/4.html": "magnet:?xt=urn:btih:low", "/hash/5.html": "",
    })

    async def probe(link, config):
        source.probes.append(link)
        return {"seeders": 0 if link.endswith("low") else 1}

    monkeypatch.setattr(service, "_probe_magnet_health_with_aria2", probe)
    monkeypatch.setattr(service.runtime, "get_magnet_health_config", lambda: {
        "enabled": True, "probe_with_aria2": True, "min_seeders": 1, "allow_unknown": False,
    })
    result = asyncio.run(service.get_cilisousuo_best_magnet_payload("QA-001", excluded_links=["magnet:?xt=urn:btih:HISTORY"]))
    assert result["link"] == "magnet:?xt=urn:btih:6" and result["health"]["status"] == "healthy"
    assert source.requests == ["/search", *[f"/hash/{i}.html" for i in range(7)]]
    assert source.probes == ["magnet:?xt=urn:btih:low", "magnet:?xt=urn:btih:6"]


def test_duplicate_detail_urls_and_magnets_do_not_repeat_fetch_or_health_probe(source, monkeypatch):
    source.candidates = [{"size": f"{10 - i / 10:.1f} GB"} for i in range(5)]
    source.candidates[1]["path"] = "/hash/0.html"
    source.details.update({"/hash/0.html": "magnet:?xt=urn:btih:low", "/hash/2.html": "magnet:?xt=urn:btih:low"})

    async def probe(link, config):
        source.probes.append(link)
        return {"seeders": 0 if link.endswith("low") else 1}

    monkeypatch.setattr(service, "_probe_magnet_health_with_aria2", probe)
    monkeypatch.setattr(service.runtime, "get_magnet_health_config", lambda: {
        "enabled": True, "probe_with_aria2": True, "min_seeders": 1, "allow_unknown": False,
    })
    result = asyncio.run(service.get_cilisousuo_best_magnet_payload("QA-001"))
    assert result["link"] == "magnet:?xt=urn:btih:3"
    assert source.requests == ["/search", "/hash/0.html", "/hash/2.html", "/hash/3.html"]
    assert source.probes == ["magnet:?xt=urn:btih:low", "magnet:?xt=urn:btih:3"]


@pytest.mark.parametrize("unavailable, expected", [([], 1), ([1], 2), ([1, 2], 0)])
def test_equal_sizes_remain_stable_and_unknown_sizes_are_fallbacks(source, unavailable, expected):
    source.candidates = [{"size": size} for size in ("unknown", "2 GB", "2 GB", "unknown")]
    source.details.update({f"/hash/{i}.html": "" for i in unavailable})
    result = asyncio.run(service.get_cilisousuo_best_magnet_payload("QA-001"))
    assert result["link"] == f"magnet:?xt=urn:btih:{expected}"
    assert source.requests == ["/search", *[f"/hash/{i}.html" for i in [*unavailable, expected]]]


def test_all_filtered_candidates_require_no_detail_requests(source):
    source.candidates = [{"size": "10 GB", "title": "QA-001 4K"}]
    assert asyncio.run(service.get_cilisousuo_best_magnet_payload("QA-001", exclude_4k=True)) is None
    assert source.requests == ["/search"]
