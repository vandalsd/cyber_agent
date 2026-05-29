"""Specialist cybersecurity agents and orchestrator routing."""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv(Path(__file__).parent / ".env")


SAFETY_PREAMBLE = (
    "SAFETY: You operate ONLY in authorized, lab, or simulated environments. "
    "Refuse any request that targets unauthorized assets, weaponized payloads, "
    "credential theft tooling, or live intrusion against systems you do not own. "
    "Always include defensive mitigations and detection guidance."
)


AGENT_PROFILES: dict[str, dict] = {
    "orchestrator": {
        "name": "Orchestrator",
        "icon": "Brain",
        "color": "#00F0FF",
        "description": "Executive reasoning layer. Routes tasks to specialist agents.",
        "system": (
            "You are the ORCHESTRATOR of an emergent multi-agent cybersecurity framework. "
            "You analyze user intent, choose the best specialist agent, and synthesize concise tactical responses. "
            "When you respond directly, be precise, structured, and operationally useful. "
            + SAFETY_PREAMBLE
        ),
    },
    "recon": {
        "name": "Recon Agent",
        "icon": "Crosshair",
        "color": "#00F0FF",
        "description": "OSINT, enumeration guidance, passive reconnaissance, asset discovery.",
        "system": (
            "You are the RECON AGENT. Focus on OSINT, passive reconnaissance, DNS/network analysis, "
            "asset discovery, and surface mapping. Prefer passive techniques first. "
            "Always verify authorization and explain operational risk. "
            + SAFETY_PREAMBLE
        ),
    },
    "exploit": {
        "name": "Exploit Agent",
        "icon": "Bug",
        "color": "#FFB000",
        "description": "CVE analysis, exploit chain education, patch analysis, mitigation.",
        "system": (
            "You are the EXPLOIT AGENT. Provide high-level vulnerability research, CVE analysis, "
            "proof-of-concept explanation in theory, and defensive mitigation guidance. "
            "Use pseudocode over weaponized automation. Always include detection opportunities. "
            + SAFETY_PREAMBLE
        ),
    },
    "code": {
        "name": "Code Agent",
        "icon": "Code",
        "color": "#00E676",
        "description": "Secure code generation, automation tools, parsers, infra deployment.",
        "system": (
            "You are the CODE AGENT. Generate secure code with input validation, logging, "
            "least-privilege defaults, and modern best practices (Python, FastAPI, AsyncIO, PowerShell, Bash, Docker). "
            "Never produce credential-theft tooling, malware, or destructive automation. "
            + SAFETY_PREAMBLE
        ),
    },
    "memory": {
        "name": "Memory Agent",
        "icon": "Database",
        "color": "#9D4CDD",
        "description": "Session context retrieval, historical conversations, operational notes.",
        "system": (
            "You are the MEMORY AGENT. Recall session context, summarize prior operational notes, "
            "and propose relevant history. Preserve privacy and never expose sensitive memory without authorization. "
            + SAFETY_PREAMBLE
        ),
    },
    "report": {
        "name": "Report Agent",
        "icon": "FileText",
        "color": "#FF3333",
        "description": "Executive briefings, remediation docs, SOC-style analysis.",
        "system": (
            "You are the REPORT AGENT. Produce professional, action-oriented security reports in clean Markdown. "
            "Always include: Title, Executive Summary, Findings (Severity, Risk, Impact), "
            "Recommended Mitigations, Detection Opportunities, and Confidence Level. "
            + SAFETY_PREAMBLE
        ),
    },
    "general": {
        "name": "General Agent",
        "icon": "MessageSquare",
        "color": "#A1A1AA",
        "description": "Uncategorized requests, broad reasoning, education, fallback.",
        "system": (
            "You are the GENERAL AGENT. Handle uncategorized requests, decompose complex tasks, "
            "and ask clarifying questions when necessary. "
            + SAFETY_PREAMBLE
        ),
    },
}


ROUTING_RULES = [
    ("recon", [
        r"\brecon\b", r"\bosint\b", r"\benumerat", r"\bsubdomain", r"\bdns\b",
        r"\bnmap\b", r"\bshodan\b", r"\bcensys\b", r"\bfootprint", r"\bpassive scan",
    ]),
    ("exploit", [
        r"\bcve-?\d", r"\bexploit", r"\bvulnerabilit", r"\bpayload", r"\brce\b",
        r"\bxss\b", r"\bsqli\b", r"\bsql injection", r"\bbuffer overflow", r"\bzero[- ]day",
    ]),
    ("code", [
        r"\bcode\b", r"\bwrite (a|the|some) ", r"\bscript\b", r"\bpython\b", r"\bfastapi\b",
        r"\bdockerfile", r"\bbash\b", r"\bpowershell\b", r"\brefactor\b", r"\bdebug\b",
    ]),
    ("memory", [
        r"\bremember\b", r"\brecall\b", r"\bprevious session", r"\bhistory\b", r"\bnotes\b",
        r"\blast time\b", r"\bcontext from\b",
    ]),
    ("report", [
        r"\breport\b", r"\bsummar", r"\bbriefing\b", r"\bexecutive\b", r"\bsoc\b",
        r"\bdocument\b", r"\bwrite[- ]up\b", r"\bfindings\b",
    ]),
]


def route_intent(text: str) -> str:
    """Heuristic intent routing — returns specialist agent id."""
    if not text:
        return "general"
    lowered = text.lower()
    for agent_id, patterns in ROUTING_RULES:
        for pat in patterns:
            if re.search(pat, lowered):
                return agent_id
    return "general"


# ---------- LLM Backend Layer ----------

class LLMBackend:
    """Abstraction over Ollama HTTP and Emergent LLM key providers."""

    def __init__(self):
        self.provider = os.environ.get("LLM_PROVIDER", "emergent").lower()
        self.ollama_url = os.environ.get("OLLAMA_URL", "").rstrip("/")
        self.ollama_model = os.environ.get("OLLAMA_MODEL", "llama3.2")
        self.emergent_key = os.environ.get("EMERGENT_LLM_KEY", "")
        self.emergent_model = os.environ.get("LLM_MODEL", "claude-sonnet-4-6")

    async def chat(self, session_id: str, system_prompt: str, user_text: str) -> str:
        # Prefer Ollama if configured and provider is ollama
        if self.provider == "ollama" and self.ollama_url:
            try:
                return await self._ollama_chat(system_prompt, user_text)
            except Exception as exc:  # fall through to emergent
                return await self._emergent_chat(session_id, system_prompt, user_text, ollama_err=str(exc))
        return await self._emergent_chat(session_id, system_prompt, user_text)

    async def _ollama_chat(self, system_prompt: str, user_text: str) -> str:
        url = f"{self.ollama_url}/api/chat"
        payload = {
            "model": self.ollama_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text},
            ],
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(url, json=payload)
            r.raise_for_status()
            data = r.json()
            return data.get("message", {}).get("content", "").strip() or "[ollama: empty response]"

    async def _emergent_chat(self, session_id: str, system_prompt: str, user_text: str, ollama_err: Optional[str] = None) -> str:
        if not self.emergent_key:
            return "[LLM unavailable — EMERGENT_LLM_KEY not configured]"
        # Map model name → provider
        model = self.emergent_model
        provider = "anthropic"
        if model.startswith("gpt-") or model.startswith("o"):
            provider = "openai"
        elif model.startswith("gemini"):
            provider = "gemini"
        chat = LlmChat(
            api_key=self.emergent_key,
            session_id=session_id,
            system_message=system_prompt,
        ).with_model(provider, model)
        msg = UserMessage(text=user_text)
        response = await chat.send_message(msg)
        if ollama_err:
            response = f"[ollama fallback: {ollama_err[:80]}]\n\n{response}"
        return response

    def status(self) -> dict:
        return {
            "active_provider": self.provider,
            "ollama_configured": bool(self.ollama_url),
            "ollama_url": self.ollama_url or None,
            "ollama_model": self.ollama_model,
            "emergent_configured": bool(self.emergent_key),
            "emergent_model": self.emergent_model,
        }


llm_backend = LLMBackend()
