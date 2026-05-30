"""Iteration 3 tests — per-agent Ollama model routing in /api/health."""
import os
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://defense-forge-7.preview.emergentagent.com"
).rstrip("/")
TOKEN = "emergent-cyber-token-2026"
H = {"Authorization": f"Bearer {TOKEN}"}

EXPECTED_AGENTS = {"orchestrator", "recon", "exploit", "code", "memory", "report", "general"}

EXPECTED_DEFAULTS = {
    "orchestrator": "phi3.5:3.8b",
    "recon": "qwen2.5:3b",
    "exploit": "qwen2.5:3b",
    "code": "qwen2.5-coder:3b",
    "memory": "llama3.2:3b",
    "report": "llama3.2:3b",
    "general": "qwen2.5:3b",
}


# ---- /api/health new agent_models field ----
def test_health_has_agent_models():
    r = requests.get(f"{BASE_URL}/api/health", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "llm" in d
    assert "agent_models" in d["llm"], f"agent_models missing: {d['llm'].keys()}"
    am = d["llm"]["agent_models"]
    assert isinstance(am, dict)
    assert set(am.keys()) == EXPECTED_AGENTS


def test_health_agent_models_defaults_present():
    r = requests.get(f"{BASE_URL}/api/health", timeout=30)
    am = r.json()["llm"]["agent_models"]
    for aid, expected in EXPECTED_DEFAULTS.items():
        assert am[aid] == expected, f"{aid}: got {am[aid]!r}, expected {expected!r}"


def test_health_renamed_ollama_global_model_field():
    r = requests.get(f"{BASE_URL}/api/health", timeout=30)
    llm = r.json()["llm"]
    # New field must exist
    assert "ollama_global_model" in llm
    # Old field name must be gone (renamed)
    assert "ollama_model" not in llm


def test_health_top_level_keys_unchanged():
    r = requests.get(f"{BASE_URL}/api/health", timeout=30)
    d = r.json()
    for k in ("status", "mongo", "llm", "telegram_configured", "telegram_running"):
        assert k in d


# ---- env override (process-level inspection) ----
def test_env_overrides_applied_in_backend_process():
    """Backend was started with OLLAMA_MODEL_CODE=qwen2.5-coder:3b in .env.
    Verify health reflects it (i.e., the env-driven default isn't stomped).
    """
    r = requests.get(f"{BASE_URL}/api/health", timeout=30)
    am = r.json()["llm"]["agent_models"]
    # Direct env value from /app/backend/.env line: OLLAMA_MODEL_CODE=qwen2.5-coder:3b
    assert am["code"] == "qwen2.5-coder:3b"
    assert am["orchestrator"] == "phi3.5:3.8b"
    assert am["memory"] == "llama3.2:3b"


# ---- Regression: agents, sessions, logs, telegram ----
def test_agents_endpoint_returns_7():
    r = requests.get(f"{BASE_URL}/api/agents", headers=H, timeout=30)
    assert r.status_code == 200
    data = r.json()
    # accept list of dicts or dict of dicts
    if isinstance(data, list):
        ids = {a.get("id") or a.get("agent_id") for a in data}
    elif isinstance(data, dict) and "agents" in data:
        agents = data["agents"]
        ids = {a.get("id") or a.get("agent_id") for a in agents} if isinstance(agents, list) else set(agents.keys())
    else:
        ids = set(data.keys())
    assert ids == EXPECTED_AGENTS, f"got: {ids}"


def test_sessions_endpoint():
    r = requests.get(f"{BASE_URL}/api/sessions", headers=H, timeout=30)
    assert r.status_code == 200


def test_logs_endpoint():
    r = requests.get(f"{BASE_URL}/api/logs", headers=H, timeout=30)
    assert r.status_code == 200


def test_telegram_status():
    r = requests.get(f"{BASE_URL}/api/telegram/status", headers=H, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["configured"] is False
    assert d["running"] is False


# ---- Regression: orchestrator chat still works (short prompt) ----
def test_orchestrator_chat_short():
    r = requests.post(
        f"{BASE_URL}/api/orchestrator/chat",
        headers=H,
        json={"text": "Reply with just the word OK."},
        timeout=90,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "agent_message" in d or "response" in d or "text" in d or "message" in d
    # routed_to should be in EXPECTED_AGENTS if present
    routed = d.get("routed_to") or d.get("agent")
    if routed:
        assert routed in EXPECTED_AGENTS


# ---- Regression: code-routed chat to validate code agent path ----
def test_orchestrator_routes_code():
    r = requests.post(
        f"{BASE_URL}/api/orchestrator/chat",
        headers=H,
        json={"text": "Write a python script that prints hello"},
        timeout=90,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    routed = d.get("routed_to") or d.get("agent")
    if routed:
        assert routed == "code", f"expected code, got {routed}"
