"""File responses stop reading when their HTTP client disconnects."""
import asyncio
from contextlib import suppress

from starlette.responses import FileResponse


class _ClientDisconnected(Exception):
    pass


class DisconnectAwareFileResponse(FileResponse):
    async def __call__(self, scope, receive, send):
        disconnected = False

        async def listen():
            nonlocal disconnected
            try:
                while (await receive())["type"] != "http.disconnect":
                    pass
            finally:
                disconnected = True

        async def send_connected(message):
            if disconnected and message["type"] != "http.response.start":
                raise _ClientDisconnected
            try:
                await send(message)
            except OSError:
                raise _ClientDisconnected from None
            # call_next needs the headers, but a departed client needs no file opened.
            if disconnected and message["type"] == "http.response.start":
                raise _ClientDisconnected

        listener = asyncio.create_task(listen())
        try:
            # Let FileResponse leave its file context without cancelling aclose.
            await super().__call__(scope, receive, send_connected)
        except _ClientDisconnected:
            pass
        finally:
            listener.cancel()
            with suppress(asyncio.CancelledError):
                await listener
