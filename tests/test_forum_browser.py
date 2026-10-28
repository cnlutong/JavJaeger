"""Bound the forum's initial challenge detection without shortening real solving."""
import asyncio

import pytest

from modules.movies import forum


class DetectionPage:
    def __init__(self, clock, html=lambda _: '<div id="threadlist">Public list</div>', frame=False):
        self.clock, self.html, self.has_frame = clock, html, frame
        self.waits = []

    async def content(self):
        return self.html(self.clock[0])

    async def wait_for_timeout(self, milliseconds):
        self.waits.append(milliseconds)
        self.clock[0] += milliseconds / 1000

    def frame(self, *, url):
        assert url.search('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/test')
        return object() if self.has_frame else None


@pytest.fixture
def detection(monkeypatch, tmp_path):
    from scrapling.fetchers import AsyncStealthySession
    clock, delegated = [0.0], []
    monkeypatch.setattr(forum, 'monotonic', lambda: clock[0], raising=False)

    async def solve(self, page, _attempts=0):
        delegated.append((page, _attempts))
        return 'solved'

    monkeypatch.setattr(AsyncStealthySession, '_cloudflare_solver', solve)
    session = forum._forum_browser_session(user_data_dir=str(tmp_path), timeout=90000, solve_cloudflare=True)
    return session, clock, delegated


def test_public_page_detection_waits_three_seconds_and_does_not_invoke_the_solver(detection):
    session, clock, delegated = detection
    page = DetectionPage(clock)
    assert asyncio.run(session._cloudflare_solver(page)) is None
    assert sum(page.waits) == pytest.approx(3000)
    assert clock[0] == pytest.approx(3)
    assert delegated == []


@pytest.mark.parametrize('kind', ['non-interactive', 'managed', 'interactive', 'embedded'])
def test_detected_challenges_delegate_immediately_to_the_unchanged_solver(detection, kind):
    session, clock, delegated = detection
    html = '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>' if kind == 'embedded' else f"<script>cType: '{kind}'</script>"
    page = DetectionPage(clock, lambda _: html, frame=True)
    assert asyncio.run(session._cloudflare_solver(page)) == 'solved'
    assert page.waits == [] and delegated == [(page, 0)]


def test_delayed_challenge_is_detected_within_the_three_second_window(detection):
    session, clock, delegated = detection
    page = DetectionPage(clock, lambda elapsed: "<script>cType: 'managed'</script>" if elapsed >= 2.8 else '<div>Loading</div>')
    assert asyncio.run(session._cloudflare_solver(page)) == 'solved'
    assert 2.8 <= clock[0] <= 3
    assert delegated == [(page, 0)]


def test_embedded_script_without_a_challenge_frame_finishes_after_three_seconds(detection):
    session, clock, delegated = detection
    page = DetectionPage(clock, lambda _: '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>')
    assert asyncio.run(session._cloudflare_solver(page)) is None
    assert clock[0] == pytest.approx(3) and delegated == []


def test_solver_retries_keep_the_upstream_attempt_counter_and_have_no_extra_detection_wait(detection):
    session, clock, delegated = detection
    page = DetectionPage(clock)
    assert asyncio.run(session._cloudflare_solver(page, 2)) == 'solved'
    assert delegated == [(page, 2)] and page.waits == []


def test_detection_does_not_swallow_cancellation(detection):
    session, clock, delegated = detection
    page = DetectionPage(clock)

    async def cancel(_):
        raise asyncio.CancelledError()

    page.wait_for_timeout = cancel
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(session._cloudflare_solver(page))
    assert delegated == []
