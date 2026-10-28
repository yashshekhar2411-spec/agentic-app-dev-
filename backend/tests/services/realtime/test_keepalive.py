"""The app's keep-alive: every "ping" gets a "pong", so the app can spot a dead connection."""


def test_ping_gets_pong(client):
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "snapshot"
        ws.send_text("ping")
        assert ws.receive_text() == "pong"
