import logging

from fastapi.testclient import TestClient

import main


def test_http_requests_are_logged(caplog):
    caplog.set_level(logging.INFO, logger="main")
    client = TestClient(main.app)

    response = client.get("/api/client-config")

    assert response.status_code == 200
    messages = [record.getMessage() for record in caplog.records if record.name == "main"]
    assert any(
        "HTTP GET /api/client-config status=200" in message and "duration_ms=" in message
        for message in messages
    )
