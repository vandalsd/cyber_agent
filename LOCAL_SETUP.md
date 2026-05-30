# 🛡️ Local Setup — GTX 1650 Ti (4 GB VRAM)

Per-agent model routing tuned for your laptop.

## 1. Install Ollama
- Download: https://ollama.com/download
- Start the daemon:
```bash
ollama serve
```

## 2. Pull the 3 models (one-time, ~6 GB disk total)
```bash
ollama pull qwen2.5:3b           # general / recon / exploit / memory / report / general
ollama pull qwen2.5-coder:3b     # code agent specialist
ollama pull phi3.5:3.8b          # orchestrator (debate synthesis reasoning)
ollama pull llama3.2:3b          # memory + report (clean Markdown)
```

> Only **one** model is in VRAM at a time — Ollama hot-swaps. Total disk ≈ 7-8 GB.

## 3. Configure the backend

Edit `backend/.env`:

```env
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434

# Optional global default (used if a per-agent override is empty)
OLLAMA_MODEL=

# Per-agent routing
OLLAMA_MODEL_ORCHESTRATOR=phi3.5:3.8b
OLLAMA_MODEL_RECON=qwen2.5:3b
OLLAMA_MODEL_EXPLOIT=qwen2.5:3b
OLLAMA_MODEL_CODE=qwen2.5-coder:3b
OLLAMA_MODEL_MEMORY=llama3.2:3b
OLLAMA_MODEL_REPORT=llama3.2:3b
OLLAMA_MODEL_GENERAL=qwen2.5:3b
```

Restart backend:
```bash
sudo supervisorctl restart backend
# or locally:
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

## 4. Verify

Open the dashboard → **System Health** page. You'll see:
- LLM Provider: **OLLAMA**
- Per-Agent Models — each agent shows its model in cyan.

Or via curl:
```bash
curl http://localhost:8001/api/health | jq '.llm.agent_models'
```

## 5. Performance expectations on GTX 1650 Ti (4 GB)

| Mode | Models touched | Latency | VRAM peak |
|---|---|---|---|
| **CHAT** (single agent) | 1 | 8-15s | ~2.5 GB |
| **STREAM** (single agent) | 1 | tokens appear in 1-2s | ~2.5 GB |
| **DEBATE** (3 specialists + 1 synthesis) | up to 3 distinct models (hot-swap) | 60-120s | ~2.5 GB peak (sequential after swap) |

> **Debate tip**: since model swaps cost 2-4s on disk-read, debates with all `qwen2.5:3b` panelists are faster than mixed-model panels. Edit the request `panel` field if you want all the same model.

## 6. Customizing models

Any HuggingFace GGUF works via Ollama's Modelfile. Examples:

**Cybersecurity-tuned** (uncensored for lab research):
```bash
# WhiteRabbitNeo 7B — will spill to CPU on 4 GB (slow but works ~5 tok/s)
ollama pull whiterabbitneo:7b
```
Then in `.env`:
```env
OLLAMA_MODEL_EXPLOIT=whiterabbitneo:7b
OLLAMA_MODEL_RECON=whiterabbitneo:7b
```

**Reasoning-tuned** (better debate synthesis):
```bash
ollama pull deepseek-r1:1.5b      # tiny but punches above weight
```
```env
OLLAMA_MODEL_ORCHESTRATOR=deepseek-r1:1.5b
```

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `[ollama fallback: …]` prefix on responses | Ollama daemon not running — `ollama serve` in another terminal |
| Very slow (< 5 tok/s) | Close other GPU apps; or drop to a smaller quant: `ollama pull qwen2.5:3b-instruct-q3_k_m` |
| Out-of-memory on debate | Use `panel: ["recon"]` (single agent) or lower context: edit `agents.py` `_ollama_chat` payload to add `"options": {"num_ctx": 2048}` |
| Want to fall back to Emergent LLM cloud when Ollama is down | Already wired — keep `EMERGENT_LLM_KEY` set; the backend auto-falls-back. |
