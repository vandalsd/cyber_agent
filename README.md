# 🛡️ Cyber Agent — Local Setup Guide

Run the full stack locally on your own machine with your own LLM.

-----

## Prerequisites

Before you start, make sure you have the following installed:

|Tool   |Version                                                          |
|-------|-----------------------------------------------------------------|
|Python |3.11+                                                            |
|Node.js|18+                                                              |
|Yarn   |Latest                                                           |
|MongoDB|Local install or [Atlas](https://www.mongodb.com/atlas) free tier|

-----

## 1. Clone the Repository

```bash
git clone https://github.com/vandalsd/cyber_agent.git cyber-agent
cd cyber-agent
```

-----

## 2. Backend Setup

```bash
cd backend
python -m venv .venv

# Mac/Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate

pip install -r requirements.txt
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
```

### Configure `backend/.env`

Create a file at `backend/.env` with the following:

```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="emergent_cyber"
CORS_ORIGINS="*"
AUTH_TOKEN=emergent-cyber-token-2026

# Default: cloud LLM via Emergent
EMERGENT_LLM_KEY=your-emergent-api-key-here
LLM_PROVIDER=emergent
LLM_MODEL=claude-sonnet-4-6

# Ollama (local LLM) — fill in if using Ollama instead
OLLAMA_URL=
OLLAMA_MODEL=

# Telegram bot — optional, fill in later
TELEGRAM_BOT_TOKEN=
```

### Start the Backend

```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

-----

## 3. Frontend Setup

Open a **new terminal** and run:

```bash
cd frontend
yarn install
```

### Configure `frontend/.env`

```env
REACT_APP_BACKEND_URL=http://localhost:8001
WDS_SOCKET_PORT=3000
```

### Start the Frontend

```bash
yarn start
```

Open <http://localhost:3000> and log in with:

```
emergent-cyber-token-2026
```

-----

## 4. Using a Local LLM via Ollama (Optional)

If you want to run the agent fully offline with your own model, install [Ollama](https://ollama.com) and pull a model:

```bash
# Example: Cisco's security-specialized reasoning model
ollama run hf.co/fdtn-ai/Foundation-Sec-8B-Reasoning-Q4_K_M-GGUF:Q4_K_M
```

Then update `backend/.env`:

```env
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=hf.co/fdtn-ai/Foundation-Sec-8B-Reasoning-Q4_K_M-GGUF:Q4_K_M
```

Restart the backend and you’re running fully local.

-----

## 5. Telegram Bot (Optional)

1. Message [@BotFather](https://t.me/BotFather) on Telegram to create a bot and get your token
1. Add it to `backend/.env`:

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
```

1. Restart the backend — the bot starts automatically
1. Check the health page; it should show **CONFIGURED · RUNNING**
1. Message your bot `/help` to test it

-----

## Quick Reference

|Service         |URL                     |
|----------------|------------------------|
|Frontend        |<http://localhost:3000> |
|Backend API     |<http://localhost:8001> |
|Ollama (if used)|<http://localhost:11434>|

-----

> Built with Python · FastAPI · React · MongoDB · Ollama
