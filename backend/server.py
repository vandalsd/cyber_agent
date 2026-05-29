"""Emergent Cybersecurity AI — FastAPI Gateway."""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, status
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from agents import AGENT_PROFILES, llm_backend, route_intent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---- Mongo ----
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# ---- App ----
app = FastAPI(title="Emergent Cybersecurity AI Gateway")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("emergent.gateway")


# ---- Auth (simple bearer token) ----
def require_auth(authorization: Optional[str] = Header(None)) -> str:
    expected = os.environ.get("AUTH_TOKEN", "")
    if not expected:
        return "anonymous"
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if token != expected:
        raise HTTPException(status_code=401, detail="Invalid token")
    return token


# ---- Models ----
def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class LoginRequest(BaseModel):
    token: str


class ChatRequest(BaseModel):
    text: str
    session_id: Optional[str] = None
    agent: Optional[str] = None  # if None → orchestrator routes


class SessionCreate(BaseModel):
    title: Optional[str] = None


class LogEntry(BaseModel):
    level: str = "INFO"
    source: str = "system"
    message: str
    meta: dict = Field(default_factory=dict)


# ---- Helpers ----
async def write_log(level: str, source: str, message: str, meta: Optional[dict] = None) -> None:
    doc = {
        "id": str(uuid.uuid4()),
        "ts": utcnow_iso(),
        "level": level.upper(),
        "source": source,
        "message": message,
        "meta": meta or {},
    }
    try:
        await db.forensic_logs.insert_one(doc)
    except Exception as exc:
        logger.warning("log insert failed: %s", exc)


def safety_check(text: str) -> Optional[str]:
    """Return a refusal message if the request looks operationally unsafe."""
    if not text:
        return None
    lowered = text.lower()
    red_flags = [
        "attack the", "hack into", "break into", "without permission",
        "ddos ", "ransomware payload", "weaponize", "evade av",
        "real target", "production target", "exfiltrate from",
    ]
    for flag in red_flags:
        if flag in lowered:
            return (
                "**Operation refused.** Request appears to target real or unauthorized systems. "
                "I can only assist within authorized, lab, or simulated environments. "
                "I can reframe this defensively — e.g., detection engineering, mitigation, "
                "or controlled sandbox lab guidance. Please clarify the authorized scope."
            )
    return None


# ---- Routes ----
@api_router.get("/")
async def root():
    return {"service": "Emergent Cybersecurity AI Gateway", "status": "online", "version": "1.0.0"}


@api_router.get("/health")
async def health():
    mongo_ok = True
    try:
        await db.command("ping")
    except Exception:
        mongo_ok = False
    return {
        "status": "ok" if mongo_ok else "degraded",
        "mongo": mongo_ok,
        "llm": llm_backend.status(),
        "telegram_configured": bool(os.environ.get("TELEGRAM_BOT_TOKEN")),
        "auth_enabled": bool(os.environ.get("AUTH_TOKEN")),
        "timestamp": utcnow_iso(),
    }


@api_router.post("/auth/login")
async def login(req: LoginRequest):
    expected = os.environ.get("AUTH_TOKEN", "")
    if not expected:
        await write_log("WARN", "auth", "login attempted with no AUTH_TOKEN set")
        return {"ok": True, "token": "anonymous", "auth_enabled": False}
    if req.token != expected:
        await write_log("ERROR", "auth", "invalid login attempt")
        raise HTTPException(status_code=401, detail="Invalid token")
    await write_log("INFO", "auth", "operator logged in")
    return {"ok": True, "token": expected, "auth_enabled": True}


@api_router.get("/agents")
async def list_agents(_: str = Depends(require_auth)):
    out = []
    for agent_id, profile in AGENT_PROFILES.items():
        out.append({
            "id": agent_id,
            "name": profile["name"],
            "icon": profile["icon"],
            "color": profile["color"],
            "description": profile["description"],
            "status": "online",
        })
    return {"agents": out}


@api_router.post("/sessions")
async def create_session(payload: SessionCreate, _: str = Depends(require_auth)):
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "title": payload.title or f"Session {sid[:8]}",
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
        "message_count": 0,
    }
    await db.sessions.insert_one(doc)
    await write_log("INFO", "session", f"created session {sid}")
    doc.pop("_id", None)
    return doc


@api_router.get("/sessions")
async def list_sessions(_: str = Depends(require_auth)):
    cursor = db.sessions.find({}, {"_id": 0}).sort("updated_at", -1)
    items = await cursor.to_list(200)
    return {"sessions": items}


@api_router.get("/sessions/{session_id}/messages")
async def session_messages(session_id: str, _: str = Depends(require_auth)):
    cursor = db.messages.find({"session_id": session_id}, {"_id": 0}).sort("ts", 1)
    items = await cursor.to_list(1000)
    return {"messages": items}


@api_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, _: str = Depends(require_auth)):
    await db.sessions.delete_one({"id": session_id})
    await db.messages.delete_many({"session_id": session_id})
    await write_log("INFO", "session", f"deleted session {session_id}")
    return {"ok": True}


@api_router.post("/orchestrator/chat")
async def orchestrator_chat(req: ChatRequest, _: str = Depends(require_auth)):
    # Ensure session
    session_id = req.session_id
    if not session_id:
        sid = str(uuid.uuid4())
        await db.sessions.insert_one({
            "id": sid,
            "title": (req.text[:40] + ("…" if len(req.text) > 40 else "")) or f"Session {sid[:8]}",
            "created_at": utcnow_iso(),
            "updated_at": utcnow_iso(),
            "message_count": 0,
        })
        session_id = sid

    # Determine agent
    chosen_agent = req.agent if req.agent and req.agent in AGENT_PROFILES else route_intent(req.text)
    if chosen_agent == "orchestrator":
        chosen_agent = route_intent(req.text)
    profile = AGENT_PROFILES[chosen_agent]

    # Save user message
    user_msg = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "role": "user",
        "agent": None,
        "text": req.text,
        "ts": utcnow_iso(),
    }
    await db.messages.insert_one(dict(user_msg))
    await write_log("INFO", "orchestrator", f"routed → {chosen_agent}", {"session": session_id})

    # Safety check
    refusal = safety_check(req.text)
    if refusal:
        agent_text = refusal
        await write_log("WARN", "safety", "operation refused by policy", {"session": session_id})
    else:
        try:
            agent_text = await llm_backend.chat(
                session_id=f"{session_id}-{chosen_agent}",
                system_prompt=profile["system"],
                user_text=req.text,
            )
        except Exception as exc:
            logger.exception("LLM error")
            await write_log("ERROR", "llm", f"backend error: {exc}", {"session": session_id})
            agent_text = f"[LLM error] {exc}"

    agent_msg = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "role": "agent",
        "agent": chosen_agent,
        "agent_name": profile["name"],
        "agent_color": profile["color"],
        "text": agent_text,
        "ts": utcnow_iso(),
    }
    await db.messages.insert_one(dict(agent_msg))
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"updated_at": utcnow_iso()}, "$inc": {"message_count": 2}},
    )

    # Auto-generate a report if it's the report agent
    if chosen_agent == "report":
        await db.reports.insert_one({
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "title": (req.text[:60] + ("…" if len(req.text) > 60 else "")),
            "markdown": agent_text,
            "created_at": utcnow_iso(),
        })

    user_msg.pop("_id", None)
    agent_msg.pop("_id", None)
    return {
        "session_id": session_id,
        "routed_to": chosen_agent,
        "user_message": user_msg,
        "agent_message": agent_msg,
    }


@api_router.get("/reports")
async def list_reports(_: str = Depends(require_auth)):
    cursor = db.reports.find({}, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(200)
    return {"reports": items}


@api_router.get("/logs")
async def list_logs(level: Optional[str] = None, limit: int = 200, _: str = Depends(require_auth)):
    q: dict = {}
    if level:
        q["level"] = level.upper()
    cursor = db.forensic_logs.find(q, {"_id": 0}).sort("ts", -1)
    items = await cursor.to_list(limit)
    return {"logs": items}


@api_router.post("/logs")
async def push_log(entry: LogEntry, _: str = Depends(require_auth)):
    await write_log(entry.level, entry.source, entry.message, entry.meta)
    return {"ok": True}


@api_router.get("/telegram/status")
async def telegram_status(_: str = Depends(require_auth)):
    """Stub — telegram bot would dispatch commands here.
    Configure TELEGRAM_BOT_TOKEN in backend/.env to enable polling.
    """
    return {
        "configured": bool(os.environ.get("TELEGRAM_BOT_TOKEN")),
        "supported_commands": [
            "/status", "/agents", "/chat <text>", "/report <topic>",
            "/sessions", "/logs", "/help",
        ],
        "note": "Long-polling bot is not started automatically. Set TELEGRAM_BOT_TOKEN and restart to enable.",
    }


# ---- App wiring ----
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await write_log("INFO", "gateway", "Emergent Cybersecurity AI Gateway online")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


@app.exception_handler(HTTPException)
async def http_exc_handler(_, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})
