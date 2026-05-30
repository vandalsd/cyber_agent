"""Emergent Cybersecurity AI — FastAPI Gateway."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from agents import AGENT_PROFILES, llm_backend, route_intent
from telegram_bot import TelegramWorker

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Emergent Cybersecurity AI Gateway")
api_router = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("emergent.gateway")

telegram_worker = TelegramWorker(db)


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


def require_query_auth(token: Optional[str] = Query(None)) -> str:
    """Auth via ?token= for SSE EventSource (which can't set headers)."""
    expected = os.environ.get("AUTH_TOKEN", "")
    if not expected:
        return "anonymous"
    if not token or token != expected:
        raise HTTPException(status_code=401, detail="Invalid token")
    return token


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class LoginRequest(BaseModel):
    token: str


class ChatRequest(BaseModel):
    text: str
    session_id: Optional[str] = None
    agent: Optional[str] = None


class DebateRequest(BaseModel):
    text: str
    session_id: Optional[str] = None
    panel: Optional[list[str]] = None  # specialist ids


class SessionCreate(BaseModel):
    title: Optional[str] = None


class LogEntry(BaseModel):
    level: str = "INFO"
    source: str = "system"
    message: str
    meta: dict = Field(default_factory=dict)


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


async def ensure_session(session_id: Optional[str], seed_text: str) -> str:
    if session_id:
        return session_id
    sid = str(uuid.uuid4())
    await db.sessions.insert_one({
        "id": sid,
        "title": (seed_text[:40] + ("…" if len(seed_text) > 40 else "")) or f"Session {sid[:8]}",
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
        "message_count": 0,
    })
    return sid


# ---- Routes ----
@api_router.get("/")
async def root():
    return {"service": "Emergent Cybersecurity AI Gateway", "status": "online", "version": "1.1.0"}


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
        "telegram_configured": telegram_worker.enabled,
        "telegram_running": bool(telegram_worker.task and not telegram_worker.task.done()),
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
    session_id = await ensure_session(req.session_id, req.text)
    chosen_agent = req.agent if req.agent and req.agent in AGENT_PROFILES else route_intent(req.text)
    if chosen_agent == "orchestrator":
        chosen_agent = route_intent(req.text)
    profile = AGENT_PROFILES[chosen_agent]

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
                agent_id=chosen_agent,
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


# ---- SSE Streaming ----
@api_router.get("/orchestrator/chat/stream")
async def orchestrator_chat_stream(
    text: str = Query(..., min_length=1),
    session_id: Optional[str] = Query(None),
    agent: Optional[str] = Query(None),
    _: str = Depends(require_query_auth),
):
    """Server-Sent Events stream of chat response in pseudo-token chunks.
    EventSource cannot send headers, so auth is via ?token= query param.
    """

    async def event_gen():
        sid = await ensure_session(session_id, text)
        chosen = agent if agent and agent in AGENT_PROFILES else route_intent(text)
        if chosen == "orchestrator":
            chosen = route_intent(text)
        profile = AGENT_PROFILES[chosen]

        # session/start frame
        yield _sse("meta", {"session_id": sid, "routed_to": chosen, "agent_name": profile["name"], "agent_color": profile["color"]})

        user_msg = {
            "id": str(uuid.uuid4()),
            "session_id": sid,
            "role": "user",
            "agent": None,
            "text": text,
            "ts": utcnow_iso(),
        }
        await db.messages.insert_one(dict(user_msg))
        user_msg.pop("_id", None)
        yield _sse("user_message", user_msg)

        refusal = safety_check(text)
        if refusal:
            response = refusal
            await write_log("WARN", "safety", "operation refused (stream)", {"session": sid})
        else:
            try:
                response = await llm_backend.chat(
                    session_id=f"{sid}-{chosen}",
                    system_prompt=profile["system"],
                    user_text=text,
                    agent_id=chosen,
                )
            except Exception as exc:
                await write_log("ERROR", "llm", f"stream backend error: {exc}", {"session": sid})
                response = f"[LLM error] {exc}"

        # Pseudo-stream: emit in word chunks
        words = response.split(" ")
        buf = ""
        for i, w in enumerate(words):
            buf += (w + (" " if i < len(words) - 1 else ""))
            if len(buf) > 8 or i == len(words) - 1:
                yield _sse("token", {"text": buf})
                buf = ""
                await asyncio.sleep(0.015)

        agent_msg = {
            "id": str(uuid.uuid4()),
            "session_id": sid,
            "role": "agent",
            "agent": chosen,
            "agent_name": profile["name"],
            "agent_color": profile["color"],
            "text": response,
            "ts": utcnow_iso(),
        }
        await db.messages.insert_one(dict(agent_msg))
        await db.sessions.update_one(
            {"id": sid},
            {"$set": {"updated_at": utcnow_iso()}, "$inc": {"message_count": 2}},
        )
        if chosen == "report":
            await db.reports.insert_one({
                "id": str(uuid.uuid4()),
                "session_id": sid,
                "title": (text[:60] + ("…" if len(text) > 60 else "")),
                "markdown": response,
                "created_at": utcnow_iso(),
            })
        agent_msg.pop("_id", None)
        yield _sse("agent_message", agent_msg)
        yield _sse("done", {"ok": True})

    return StreamingResponse(event_gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    })


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


# ---- Multi-agent debate ----
@api_router.post("/orchestrator/debate")
async def orchestrator_debate(req: DebateRequest, _: str = Depends(require_auth)):
    """Multi-agent debate: panel of specialists each weigh in, then orchestrator synthesizes."""
    session_id = await ensure_session(req.session_id, req.text)

    # default panel: recon, exploit, code (most analytically distinct)
    panel_ids = req.panel or ["recon", "exploit", "code"]
    panel_ids = [p for p in panel_ids if p in AGENT_PROFILES and p != "orchestrator"][:5]
    if not panel_ids:
        panel_ids = ["recon", "exploit", "code"]

    # save user message
    user_msg = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "role": "user",
        "agent": None,
        "text": req.text,
        "ts": utcnow_iso(),
        "mode": "debate",
    }
    await db.messages.insert_one(dict(user_msg))
    user_msg.pop("_id", None)
    await write_log("INFO", "debate", f"panel: {','.join(panel_ids)}", {"session": session_id})

    refusal = safety_check(req.text)
    if refusal:
        agent_msg = {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "role": "agent",
            "agent": "orchestrator",
            "agent_name": "Orchestrator",
            "agent_color": "#00F0FF",
            "text": refusal,
            "ts": utcnow_iso(),
        }
        await db.messages.insert_one(dict(agent_msg))
        agent_msg.pop("_id", None)
        return {"session_id": session_id, "panel": panel_ids, "rounds": [], "synthesis": agent_msg}

    # Round 1: each specialist responds independently
    async def specialist_turn(aid: str) -> dict:
        p = AGENT_PROFILES[aid]
        prompt = (
            f"You are participating in a multi-agent debate. Provide YOUR perspective as the {p['name']} "
            f"on the question below — concise (max 6 sentences), focused on your domain, "
            f"and flag any disagreement you'd expect from peers.\n\nQUESTION: {req.text}"
        )
        try:
            txt = await llm_backend.chat(
                session_id=f"{session_id}-debate-{aid}",
                system_prompt=p["system"],
                user_text=prompt,
                agent_id=aid,
            )
        except Exception as exc:
            txt = f"[error: {exc}]"
        return {"agent": aid, "agent_name": p["name"], "agent_color": p["color"], "text": txt}

    round1 = await asyncio.gather(*(specialist_turn(a) for a in panel_ids))

    # Round 2: orchestrator synthesizes
    debate_summary = "\n\n".join(
        f"### {r['agent_name']} ({r['agent']})\n{r['text']}" for r in round1
    )
    synth_prompt = (
        f"As the ORCHESTRATOR, synthesize the panel below into a single coherent tactical answer. "
        f"Resolve disagreements, surface consensus, highlight residual uncertainty, and end with "
        f"3 numbered next actions. Use Markdown.\n\n"
        f"USER QUESTION: {req.text}\n\n"
        f"PANEL RESPONSES:\n{debate_summary}"
    )
    orch = AGENT_PROFILES["orchestrator"]
    try:
        synthesis_text = await llm_backend.chat(
            session_id=f"{session_id}-debate-synth",
            system_prompt=orch["system"],
            user_text=synth_prompt,
            agent_id="orchestrator",
        )
    except Exception as exc:
        synthesis_text = f"[orchestrator error: {exc}]"

    # persist all messages
    for r in round1:
        await db.messages.insert_one({
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "role": "agent",
            "agent": r["agent"],
            "agent_name": r["agent_name"],
            "agent_color": r["agent_color"],
            "text": r["text"],
            "ts": utcnow_iso(),
            "mode": "debate-round1",
        })
    synth_msg = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "role": "agent",
        "agent": "orchestrator",
        "agent_name": "Orchestrator",
        "agent_color": "#00F0FF",
        "text": synthesis_text,
        "ts": utcnow_iso(),
        "mode": "debate-synthesis",
    }
    await db.messages.insert_one(dict(synth_msg))
    synth_msg.pop("_id", None)
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"updated_at": utcnow_iso()}, "$inc": {"message_count": len(round1) + 2}},
    )
    return {
        "session_id": session_id,
        "panel": panel_ids,
        "user_message": user_msg,
        "rounds": round1,
        "synthesis": synth_msg,
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
    return {
        "configured": telegram_worker.enabled,
        "running": bool(telegram_worker.task and not telegram_worker.task.done()),
        "supported_commands": ["/status", "/agents", "/chat <text>", "/report <topic>", "/help"],
        "setup_steps": [
            "1. Talk to @BotFather on Telegram and create a bot to obtain a token.",
            "2. Paste the token into backend/.env as TELEGRAM_BOT_TOKEN=...",
            "3. Run: sudo supervisorctl restart backend",
            "4. Message your bot — /help to see commands.",
        ],
    }


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
    telegram_worker.start()


@app.on_event("shutdown")
async def on_shutdown():
    await telegram_worker.stop()
    client.close()


@app.exception_handler(HTTPException)
async def http_exc_handler(_, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})
