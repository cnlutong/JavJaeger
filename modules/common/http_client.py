"""Reuse default HTTP connections within a batch without sharing session state."""
import asyncio
from contextlib import asynccontextmanager
from contextvars import ContextVar

import httpx

from .runtime import finish_before_cancel


class _BorrowedTransport(httpx.AsyncBaseTransport):
    def __init__(self):
        self.loop = asyncio.get_running_loop()
        self.owner = None

    async def handle_async_request(self, request):
        if self.owner is None:
            self.owner = httpx.AsyncClient()
        # Use HTTPX's own proxy/NO_PROXY routing; a custom transport disables
        # automatic environment proxy mounts on the independent borrower client.
        transport = self.owner._transport_for_url(request.url)
        return await transport.handle_async_request(request)

    async def aclose(self):
        # Only the enclosing batch closes the shared transports.
        pass


_current_transport = ContextVar("batch_http_transport", default=None)


@asynccontextmanager
async def http_client_scope():
    transport = _current_transport.get()
    if transport is not None and transport.loop is asyncio.get_running_loop():
        yield
        return
    transport = _BorrowedTransport()
    token = _current_transport.set(transport)
    try:
        yield
    finally:
        _current_transport.reset(token)
        if transport.owner is not None:
            await finish_before_cancel(transport.owner.aclose())


def create_http_client(**kwargs):
    """Create an independent session using the batch's default network settings."""
    transport = _current_transport.get()
    if transport is not None and transport.loop is asyncio.get_running_loop():
        kwargs["transport"] = transport
    return httpx.AsyncClient(**kwargs)
