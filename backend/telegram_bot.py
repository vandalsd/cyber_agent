"""Telegram long-polling worker. Dormant unless TELEGRAM_BOT_TOKEN is set."""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

import httpx

from agents import AGENT_PROFILES, llm_backend, route_intent

logger = logging.getLogger("emergent.telegram")

API_BASE = "https://api.telegram.org"


HELP = (
    "*Emergent Cybersecurity AI — Telegram*\n\n"
    "/status — gateway health\n"
    "/agents — list specialist agents\n"
    "/chat <text> — dispatch to orchestrator\n"
    "/report <topic> — force-route to Report Agent\n"
    "/help — this message\n\n"
    "_Authorized lab/research use only._"
)


class TelegramWorker:
    def __init__(self, db):
        self.db = db
        self.token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
        self.task: Optional[asyncio.Task] = None
        self.offset = 0
        self.running = False

    @property
    def enabled(self) -> bool:
        return bool(self.token)

    def start(self) -> None:
        if not self.enabled:
            logger.info("Telegram disabled (no TELEGRAM_BOT_TOKEN).")
            return
        if self.task and not self.task.done():
            return
        self.running = True
        self.task = asyncio.create_task(self._loop())
        logger.info("Telegram long-poll worker started.")

    async def stop(self) -> None:
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except Exception:
                pass

    async def _loop(self) -> None:
        url = f"{API_BASE}/bot{self.token}/getUpdates"
        async with httpx.AsyncClient(timeout=35) as client:
            while self.running:
                try:
                    r = await client.get(url, params={"timeout": 25, "offset": self.offset})
                    data = r.json()
                    if not data.get("ok"):
                        logger.warning("telegram getUpdates !ok: %s", data)
                        await asyncio.sleep(5)
                        continue
                    for upd in data.get("result", []):
                        self.offset = upd["update_id"] + 1
                        msg = upd.get("message") or upd.get("edited_message")
                        if not msg:
                            continue
                        chat_id = msg["chat"]["id"]
                        text = (msg.get("text") or "").strip()
                        await self._handle(client, chat_id, text)
                except asyncio.CancelledError:
                    break
                except Exception as exc:
                    logger.warning("telegram loop error: %s", exc)
                    await asyncio.sleep(3)

    async def _send(self, client: httpx.AsyncClient, chat_id: int, text: str) -> None:
        url = f"{API_BASE}/bot{self.token}/sendMessage"
        # Telegram limits to 4096
        for chunk in [text[i : i + 3900] for i in range(0, len(text), 3900)] or [""]:
            try:
                await client.post(url, json={"chat_id": chat_id, "text": chunk, "parse_mode": "Markdown"})
            except Exception:
                await client.post(url, json={"chat_id": chat_id, "text": chunk})

    async def _handle(self, client: httpx.AsyncClient, chat_id: int, text: str) -> None:
        if not text:
            return
        if text in {"/start", "/help"}:
            await self._send(client, chat_id, HELP)
            return
        if text == "/status":
            await self._send(client, chat_id, f"Gateway *ONLINE*. LLM: `{llm_backend.status()}`")
            return
        if text == "/agents":
            lines = ["*Specialist Agents:*"]
            for aid, p in AGENT_PROFILES.items():
                lines.append(f"• `{aid}` — {p['name']}")
            await self._send(client, chat_id, "\n".join(lines))
            return

        # /chat <text> or /report <text> or default
        force_agent = None
        body = text
        if text.startswith("/chat"):
            body = text[len("/chat") :].strip()
        elif text.startswith("/report"):
            body = text[len("/report") :].strip()
            force_agent = "report"

        if not body:
            await self._send(client, chat_id, "Provide text after the command.")
            return

        agent_id = force_agent or route_intent(body)
        profile = AGENT_PROFILES[agent_id]
        await self._send(client, chat_id, f"_routed → *{profile['name']}*_")
        try:
            reply = await llm_backend.chat(
                session_id=f"telegram-{chat_id}-{agent_id}",
                system_prompt=profile["system"],
                user_text=body,
            )
        except Exception as exc:
            reply = f"[LLM error] {exc}"
        await self._send(client, chat_id, reply)
        # log forensic
        try:
            await self.db.forensic_logs.insert_one({
                "id": f"tg-{chat_id}-{self.offset}",
                "ts": _utcnow(),
                "level": "INFO",
                "source": "telegram",
                "message": f"telegram chat→{agent_id}",
                "meta": {"chat_id": chat_id, "len": len(body)},
            })
        except Exception:
            pass


def _utcnow() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
