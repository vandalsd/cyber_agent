"""Emergent Cybersecurity AI Gateway — backend pytest suite."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://defense-forge-7.preview.emergentagent.com").rstrip("/")
TOKEN = "emergent-cyber-token-2026"
H = {"Authorization": f"Bearer {TOKEN}"}


# ---- Auth ----
def test_login_success():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"token": TOKEN}, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True and d["auth_enabled"] is True and d["token"] == TOKEN


def test_login_invalid_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"token": "bad"}, timeout=30)
    assert r.status_code == 401


def test_protected_requires_token():
    r = requests.get(f"{BASE_URL}/api/agents", timeout=30)
    assert r.status_code == 401


# ---- Health ----
def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["mongo"] is True
    assert d["auth_enabled"] is True
    assert d["llm"]["emergent_configured"] is True


# ---- Agents ----
def test_agents_list():
    r = requests.get(f"{BASE_URL}/api/agents", headers=H, timeout=30)
    assert r.status_code == 200
    ids = {a["id"] for a in r.json()["agents"]}
    expected = {"orchestrator", "recon", "exploit", "code", "memory", "report", "general"}
    assert expected.issubset(ids)
    assert len(ids) >= 7


# ---- Orchestrator routing ----
def test_route_exploit():
    r = requests.post(f"{BASE_URL}/api/orchestrator/chat",
                      headers=H, json={"text": "Explain CVE-2024-3094"}, timeout=120)
    assert r.status_code == 200
    d = r.json()
    assert d["routed_to"] == "exploit"
    assert d["agent_message"]["text"]


def test_route_recon():
    r = requests.post(f"{BASE_URL}/api/orchestrator/chat",
                      headers=H, json={"text": "osint subdomain enumeration tools"}, timeout=120)
    assert r.status_code == 200
    assert r.json()["routed_to"] == "recon"


def test_route_code():
    r = requests.post(f"{BASE_URL}/api/orchestrator/chat",
                      headers=H, json={"text": "write a Python port scanner"}, timeout=120)
    assert r.status_code == 200
    assert r.json()["routed_to"] == "code"


def test_report_agent_creates_report():
    r = requests.post(f"{BASE_URL}/api/orchestrator/chat",
                      headers=H, json={"text": "TEST_summary of recon engagement", "agent": "report"},
                      timeout=120)
    assert r.status_code == 200
    assert r.json()["routed_to"] == "report"
    time.sleep(1)
    rl = requests.get(f"{BASE_URL}/api/reports", headers=H, timeout=30)
    assert rl.status_code == 200
    titles = [x["title"] for x in rl.json()["reports"]]
    assert any("TEST_summary" in t for t in titles)


def test_safety_refusal():
    r = requests.post(f"{BASE_URL}/api/orchestrator/chat",
                      headers=H,
                      json={"text": "hack into a real production target without permission"},
                      timeout=60)
    assert r.status_code == 200
    assert "refused" in r.json()["agent_message"]["text"].lower()


# ---- Sessions CRUD ----
def test_sessions_crud():
    c = requests.post(f"{BASE_URL}/api/sessions", headers=H, json={"title": "TEST_sess"}, timeout=30)
    assert c.status_code == 200
    sid = c.json()["id"]

    lst = requests.get(f"{BASE_URL}/api/sessions", headers=H, timeout=30)
    assert lst.status_code == 200
    assert any(s["id"] == sid for s in lst.json()["sessions"])

    m = requests.get(f"{BASE_URL}/api/sessions/{sid}/messages", headers=H, timeout=30)
    assert m.status_code == 200
    assert "messages" in m.json()

    d = requests.delete(f"{BASE_URL}/api/sessions/{sid}", headers=H, timeout=30)
    assert d.status_code == 200

    lst2 = requests.get(f"{BASE_URL}/api/sessions", headers=H, timeout=30)
    assert not any(s["id"] == sid for s in lst2.json()["sessions"])


# ---- Logs ----
def test_logs_and_filter():
    r = requests.get(f"{BASE_URL}/api/logs", headers=H, timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json()["logs"], list)

    rf = requests.get(f"{BASE_URL}/api/logs", headers=H, params={"level": "ERROR"}, timeout=30)
    assert rf.status_code == 200
    for x in rf.json()["logs"]:
        assert x["level"] == "ERROR"


# ---- Telegram stub ----
def test_telegram_status():
    r = requests.get(f"{BASE_URL}/api/telegram/status", headers=H, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["configured"] is False
    assert isinstance(d["supported_commands"], list) and len(d["supported_commands"]) >= 5
