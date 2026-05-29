"""Iteration 2 tests — SSE streaming, multi-agent debate, telegram setup, health additions."""
import json
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://defense-forge-7.preview.emergentagent.com").rstrip("/")
TOKEN = "emergent-cyber-token-2026"
H = {"Authorization": f"Bearer {TOKEN}"}


# ---- Health: new telegram fields ----
def test_health_telegram_fields():
    r = requests.get(f"{BASE_URL}/api/health", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "telegram_configured" in d
    assert "telegram_running" in d
    assert d["telegram_configured"] is False
    assert d["telegram_running"] is False


# ---- Telegram status: setup_steps ----
def test_telegram_status_setup_steps():
    r = requests.get(f"{BASE_URL}/api/telegram/status", headers=H, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["configured"] is False
    assert d["running"] is False
    assert isinstance(d["supported_commands"], list) and len(d["supported_commands"]) >= 5
    assert isinstance(d["setup_steps"], list) and len(d["setup_steps"]) >= 3
    assert any("BotFather" in s for s in d["setup_steps"])


# ---- SSE stream: missing token = 401 ----
def test_stream_requires_token():
    r = requests.get(
        f"{BASE_URL}/api/orchestrator/chat/stream",
        params={"text": "hello"},
        timeout=30,
    )
    assert r.status_code == 401


def test_stream_wrong_token():
    r = requests.get(
        f"{BASE_URL}/api/orchestrator/chat/stream",
        params={"text": "hello", "token": "bad"},
        timeout=30,
    )
    assert r.status_code == 401


# ---- SSE stream: frames ----
def _parse_sse(raw: str):
    events = []
    current = {}
    for line in raw.splitlines():
        if line.startswith("event:"):
            current["event"] = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            current["data"] = line.split(":", 1)[1].strip()
        elif line == "" and current:
            events.append(current)
            current = {}
    if current:
        events.append(current)
    return events


def test_stream_returns_sse_frames():
    short_prompt = "List 3 OSINT tools in one short line"
    with requests.get(
        f"{BASE_URL}/api/orchestrator/chat/stream",
        params={"text": short_prompt, "token": TOKEN},
        stream=True,
        timeout=120,
    ) as r:
        assert r.status_code == 200
        ctype = r.headers.get("Content-Type", "")
        assert "text/event-stream" in ctype, f"got: {ctype}"
        raw = ""
        for chunk in r.iter_content(chunk_size=None, decode_unicode=True):
            if chunk:
                raw += chunk
            if "event: done" in raw:
                break

    events = _parse_sse(raw)
    event_types = [e.get("event") for e in events]
    assert "meta" in event_types
    assert "user_message" in event_types
    assert event_types.count("token") >= 1
    assert "agent_message" in event_types
    assert "done" in event_types

    # JSON parseability and content
    for e in events:
        json.loads(e["data"])  # all parseable

    meta = json.loads(next(e["data"] for e in events if e["event"] == "meta"))
    assert "session_id" in meta and "routed_to" in meta and "agent_name" in meta

    agent_msg = json.loads(next(e["data"] for e in events if e["event"] == "agent_message"))
    assert agent_msg["text"]
    assert agent_msg["role"] == "agent"


# ---- Debate: default panel ----
def test_debate_default_panel():
    r = requests.post(
        f"{BASE_URL}/api/orchestrator/debate",
        headers=H,
        json={"text": "In one sentence, what is Zero Trust?"},
        timeout=180,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["panel"] == ["recon", "exploit", "code"]
    assert isinstance(d["rounds"], list) and len(d["rounds"]) == 3
    panel_ids_in_rounds = [r2["agent"] for r2 in d["rounds"]]
    assert set(panel_ids_in_rounds) == {"recon", "exploit", "code"}
    assert d["synthesis"]["agent"] == "orchestrator"
    assert d["synthesis"]["text"]
    assert "session_id" in d


# ---- Debate: custom panel honored, orchestrator stripped ----
def test_debate_custom_panel():
    r = requests.post(
        f"{BASE_URL}/api/orchestrator/debate",
        headers=H,
        json={
            "text": "In one sentence, what is XSS?",
            "panel": ["recon", "memory", "orchestrator", "not_a_real_agent"],
        },
        timeout=180,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    # orchestrator + bogus stripped
    assert d["panel"] == ["recon", "memory"]
    assert len(d["rounds"]) == 2
    assert {r2["agent"] for r2 in d["rounds"]} == {"recon", "memory"}
    assert d["synthesis"]["text"]
