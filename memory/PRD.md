# Emergent Cybersecurity AI — Product Requirements

## Original Problem Statement
Build an advanced multi-agent cybersecurity orchestration framework with:
- FastAPI Gateway on /api (port 8001 internally, 8080 spec)
- Telegram command/control interface (stub)
- Central Orchestrator with intelligent routing
- Specialized autonomous agents (Recon, Exploit, Code, Memory, Report, General)
- Shared memory/session persistence (MongoDB)
- LLM execution (Ollama remote + Emergent LLM fallback)
- JSON-based forensic logging
- React dashboard

## User Choices
- LLM backend: Remote Ollama (URL provided later) + Emergent LLM fallback (Claude Sonnet 4.6)
- Telegram: stub for now
- Auth: simple bearer token from .env
- Primary interface: React web dashboard
- Design: tactical dark SOC console (design agent decided)

## Architecture
- Backend: FastAPI + Motor (Mongo) + emergentintegrations + httpx (Ollama)
- Routing: regex-based intent detection → specialist agent
- Frontend: React 19 + Tailwind + Phosphor Icons + react-markdown
- Theme: IBM Plex Sans / Inter / JetBrains Mono, dark #050505 base + cyan #00F0FF accent

## What's Implemented (2026-05-29)
- [x] Bearer token auth (/api/auth/login, require_auth dep)
- [x] LLM abstraction layer (Ollama + Emergent LLM with fallback)
- [x] 7 agents with system prompts + safety preamble
- [x] Orchestrator regex routing (recon/exploit/code/memory/report fallback general)
- [x] Sessions CRUD (/api/sessions)
- [x] Chat orchestration (/api/orchestrator/chat) — saves user + agent messages, auto-creates session
- [x] Forensic logging (/api/logs) with level filter
- [x] Auto report persistence when report agent is invoked
- [x] Safety check that refuses requests targeting real/unauthorized systems
- [x] Telegram status stub (/api/telegram/status)
- [x] Health endpoint with Mongo + LLM + Telegram + auth status
- [x] React: Login → Console → Agents → Sessions → Reports → Logs → Health
- [x] Tactical dark UI with custom fonts, scanline, pulse-dot, grain texture
- [x] All key elements carry data-testid

## Tested & Verified
- Backend: 12/13 endpoints (92%) — chat routing confirmed; auth, agents, sessions, reports, logs, health
- Frontend: login + nav + all dashboard pages render

## Known Limitations
- Long code-agent responses (>60s) hit Kubernetes ingress 502 timeout — system prompt trimmed for brevity; consider streaming in future
- Telegram bot does not run a long-poll loop yet (stub only)
- No streaming responses (SSE/WebSocket) yet

## Backlog
### P1
- Streaming chat responses (SSE)
- Telegram long-polling bot worker (background task)
- Command palette (Cmd+K) in console
- Multi-agent debate / refinement mode
### P2
- Local vector memory (RAG) over session history
- Export reports as PDF/Markdown
- Plugin/tool registry
- Per-user role-based permissions
- Sandboxed code execution for Code Agent
