import { useEffect, useRef, useState } from "react";
import {
  PaperPlaneTilt,
  Brain,
  Crosshair,
  Bug,
  Code,
  Database,
  FileText,
  ChatCircleText,
  Trash,
  Plus,
  Lightning,
  UsersThree,
  Command,
} from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import {
  getSessions,
  getMessages,
  sendChat,
  sendDebate,
  streamChatUrl,
  createSession,
  deleteSession,
  getAgents,
} from "@/lib/api";
import { toast } from "sonner";

const ICONS = {
  Brain,
  Crosshair,
  Bug,
  Code,
  Database,
  FileText,
  MessageSquare: ChatCircleText,
};

export default function Console() {
  const [agents, setAgents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [mode, setMode] = useState("stream"); // "stream" | "chat" | "debate"
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamMeta, setStreamMeta] = useState(null);
  const scrollRef = useRef(null);
  const sourceRef = useRef(null);

  const refreshSessions = async () => {
    const r = await getSessions();
    setSessions(r.sessions || []);
  };
  const loadMessages = async (sid) => {
    if (!sid) return setMessages([]);
    const r = await getMessages(sid);
    setMessages(r.messages || []);
  };

  useEffect(() => {
    getAgents().then((r) => setAgents(r.agents || [])).catch(() => {});
    refreshSessions();
  }, []);

  useEffect(() => {
    if (activeSession) loadMessages(activeSession);
    else setMessages([]);
  }, [activeSession]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamText]);

  // Palette events (Cmd+K dispatches)
  useEffect(() => {
    const handler = (e) => {
      const { type, agent, mode: m } = e.detail || {};
      if (type === "agent") setSelectedAgent(agent || "");
      else if (type === "mode") setMode(m);
    };
    window.addEventListener("emergent:palette", handler);
    return () => window.removeEventListener("emergent:palette", handler);
  }, []);

  const newSession = async () => {
    const s = await createSession(null);
    await refreshSessions();
    setActiveSession(s.id);
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    await deleteSession(id);
    if (activeSession === id) setActiveSession(null);
    refreshSessions();
  };

  const sendStream = (text) => {
    return new Promise((resolve, reject) => {
      const url = streamChatUrl(text, activeSession, selectedAgent || null);
      const es = new EventSource(url);
      sourceRef.current = es;
      let buffer = "";
      let meta = null;
      es.addEventListener("meta", (ev) => {
        meta = JSON.parse(ev.data);
        setStreamMeta(meta);
      });
      es.addEventListener("user_message", (ev) => {
        const um = JSON.parse(ev.data);
        if (!activeSession) {
          setActiveSession(um.session_id);
          refreshSessions();
        }
        setMessages((m) => [...m.filter((x) => !String(x.id).startsWith("tmp-")), um]);
      });
      es.addEventListener("token", (ev) => {
        const t = JSON.parse(ev.data).text;
        buffer += t;
        setStreamText(buffer);
      });
      es.addEventListener("agent_message", (ev) => {
        const am = JSON.parse(ev.data);
        setMessages((m) => [...m, am]);
        setStreamText("");
        setStreamMeta(null);
      });
      es.addEventListener("done", () => {
        es.close();
        sourceRef.current = null;
        refreshSessions();
        resolve();
      });
      es.onerror = (err) => {
        es.close();
        sourceRef.current = null;
        reject(err);
      };
    });
  };

  const send = async (e) => {
    e?.preventDefault();
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    const tmpId = `tmp-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: tmpId, role: "user", text, ts: new Date().toISOString() },
    ]);

    try {
      if (mode === "stream") {
        await sendStream(text);
      } else if (mode === "debate") {
        const r = await sendDebate(text, activeSession, null);
        if (!activeSession) {
          setActiveSession(r.session_id);
          refreshSessions();
        } else {
          refreshSessions();
        }
        const all = [
          { ...r.user_message },
          ...r.rounds.map((x, i) => ({
            id: `r1-${i}-${Date.now()}`,
            role: "agent",
            ...x,
            ts: new Date().toISOString(),
            mode: "debate-round1",
          })),
          { ...r.synthesis },
        ];
        setMessages((m) => [...m.filter((x) => x.id !== tmpId), ...all]);
      } else {
        const r = await sendChat(text, activeSession, selectedAgent || null);
        if (!activeSession) {
          setActiveSession(r.session_id);
          refreshSessions();
        } else {
          refreshSessions();
        }
        setMessages((m) => [
          ...m.filter((x) => x.id !== tmpId),
          r.user_message,
          r.agent_message,
        ]);
      }
    } catch (err) {
      toast.error("Request failed: " + (err?.response?.data?.error || err.message || "stream error"));
      setMessages((m) => m.filter((x) => x.id !== tmpId));
    } finally {
      setSending(false);
      setStreamText("");
      setStreamMeta(null);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="px-6 py-3 border-b border-white/10 bg-[#050505]/80 backdrop-blur flex items-center justify-between sticky top-0 z-10">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Orchestration Console
          </div>
          <div className="font-display text-lg">Tactical Chat</div>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle mode={mode} setMode={setMode} />
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            data-testid="open-palette"
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border border-white/10 hover:border-[#00F0FF]/50 hover:text-[#00F0FF] rounded-md transition-colors"
          >
            <Command size={12} /> ⌘K
          </button>
          <button
            onClick={newSession}
            data-testid="new-session-button"
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border border-white/10 hover:border-[#00F0FF]/50 hover:text-[#00F0FF] rounded-md transition-colors"
          >
            <Plus size={14} weight="bold" /> NEW
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 min-h-0">
        <div className="col-span-3 border-r border-white/10 bg-[#0a0a0c] overflow-y-auto">
          <div className="px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-zinc-500 border-b border-white/5">
            Sessions ({sessions.length})
          </div>
          {sessions.length === 0 && (
            <div className="p-4 text-xs text-zinc-500 font-mono">
              No sessions yet. Send a message to begin.
            </div>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSession(s.id)}
              data-testid={`session-item-${s.id}`}
              className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors group ${
                activeSession === s.id
                  ? "bg-[#121214] border-l-2 border-l-[#00F0FF]"
                  : "hover:bg-[#121214]/60 border-l-2 border-l-transparent"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{s.title}</div>
                  <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                    {new Date(s.updated_at).toLocaleString()} · {s.message_count} msg
                  </div>
                </div>
                <Trash
                  size={14}
                  onClick={(e) => remove(s.id, e)}
                  className="text-zinc-600 hover:text-[#FF3333] opacity-0 group-hover:opacity-100 transition"
                />
              </div>
            </button>
          ))}
        </div>

        <div className="col-span-9 flex flex-col min-h-0 bg-[#050505]">
          <div
            ref={scrollRef}
            data-testid="chat-messages"
            className="flex-1 overflow-y-auto px-8 py-6 space-y-4"
          >
            {messages.length === 0 && !streamText && (
              <div className="text-center text-zinc-500 mt-20 font-mono text-xs space-y-1">
                <div className="text-[#00F0FF] text-sm mb-2">// READY</div>
                <div>Orchestrator awaits. Press ⌘K for the command palette.</div>
                <div className="mt-2 opacity-70">
                  Try: "Analyze CVE-2024-3094" · "Write a port scanner in Python" ·
                  "Generate a SOC report on phishing"
                </div>
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} agents={agents} />
            ))}
            {streamText && streamMeta && (
              <StreamBubble text={streamText} meta={streamMeta} />
            )}
            {sending && !streamText && (
              <div className="text-xs font-mono text-[#00F0FF] flex items-center gap-2 pl-1">
                <span className="inline-block w-1.5 h-3 bg-[#00F0FF] animate-pulse" />
                {mode === "debate" ? "convening panel…" : "routing…"}
              </div>
            )}
          </div>

          <form onSubmit={send} className="border-t border-white/10 bg-[#0a0a0c] p-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Target
              </span>
              <button
                type="button"
                onClick={() => setSelectedAgent("")}
                data-testid="agent-chip-auto"
                disabled={mode === "debate"}
                className={`text-[11px] font-mono px-2 py-0.5 rounded border transition disabled:opacity-30 ${
                  selectedAgent === ""
                    ? "bg-[#00F0FF] text-black border-[#00F0FF]"
                    : "border-white/10 hover:border-white/30 text-zinc-400"
                }`}
              >
                AUTO
              </button>
              {agents
                .filter((a) => a.id !== "orchestrator")
                .map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedAgent(a.id)}
                    data-testid={`agent-chip-${a.id}`}
                    disabled={mode === "debate"}
                    className={`text-[11px] font-mono px-2 py-0.5 rounded border transition disabled:opacity-30 ${
                      selectedAgent === a.id
                        ? "text-black border-transparent"
                        : "border-white/10 hover:border-white/30 text-zinc-400"
                    }`}
                    style={selectedAgent === a.id ? { background: a.color } : undefined}
                  >
                    {a.name.replace(" Agent", "").toUpperCase()}
                  </button>
                ))}
              {mode === "debate" && (
                <span className="ml-2 text-[10px] font-mono text-[#9D4CDD]">
                  · panel: recon · exploit · code
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#00F0FF] font-mono text-sm select-none">{">"}</span>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                data-testid="chat-input"
                placeholder="enter command or query…"
                disabled={sending}
                className="flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-zinc-600"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                data-testid="chat-send-button"
                className="flex items-center gap-1.5 bg-[#00F0FF] text-black text-xs font-medium px-3 py-1.5 rounded-md hover:bg-white disabled:opacity-40 transition-colors"
              >
                <PaperPlaneTilt size={14} weight="fill" />
                {mode === "debate" ? "DEBATE" : mode === "stream" ? "STREAM" : "DISPATCH"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function ModeToggle({ mode, setMode }) {
  const modes = [
    { id: "stream", label: "STREAM", icon: Lightning, color: "#00F0FF" },
    { id: "chat", label: "CHAT", icon: ChatCircleText, color: "#A1A1AA" },
    { id: "debate", label: "DEBATE", icon: UsersThree, color: "#9D4CDD" },
  ];
  return (
    <div className="flex border border-white/10 rounded-md overflow-hidden" data-testid="mode-toggle">
      {modes.map((m) => {
        const Icon = m.icon;
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            data-testid={`mode-${m.id}`}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-[0.15em] transition-colors ${
              active ? "text-black" : "text-zinc-400 hover:text-white"
            }`}
            style={active ? { background: m.color } : undefined}
          >
            <Icon size={11} weight={active ? "fill" : "regular"} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function MessageBubble({ msg, agents }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end" data-testid="message-user">
        <div className="max-w-[75%] bg-[#121214] border border-white/10 rounded-md px-4 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 mb-1">
            Operator
          </div>
          <div className="font-mono text-sm whitespace-pre-wrap">{msg.text}</div>
        </div>
      </div>
    );
  }
  const agent = agents.find((a) => a.id === msg.agent);
  const color = msg.agent_color || agent?.color || "#A1A1AA";
  const Icon = ICONS[agent?.icon] || ChatCircleText;
  const isSynthesis = msg.mode === "debate-synthesis";
  const isRound1 = msg.mode === "debate-round1";
  return (
    <div className="flex justify-start" data-testid={`message-agent-${msg.agent}`}>
      <div
        className={`max-w-[85%] border rounded-md px-4 py-2.5 bg-[#0a0a0c] ${
          isSynthesis ? "border-[#00F0FF]/40" : "border-white/10"
        }`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Icon size={14} weight="bold" style={{ color }} />
          <div className="text-[10px] uppercase tracking-[0.15em]" style={{ color }}>
            {msg.agent_name || msg.agent}
          </div>
          {isRound1 && (
            <span className="text-[9px] uppercase tracking-[0.18em] text-[#9D4CDD] border border-[#9D4CDD]/40 px-1.5 py-0.5 rounded">
              DEBATE
            </span>
          )}
          {isSynthesis && (
            <span className="text-[9px] uppercase tracking-[0.18em] text-[#00F0FF] border border-[#00F0FF]/40 px-1.5 py-0.5 rounded">
              SYNTHESIS
            </span>
          )}
          <div className="text-[10px] text-zinc-600 font-mono">
            {msg.ts ? new Date(msg.ts).toLocaleTimeString() : ""}
          </div>
        </div>
        <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-[#050505] prose-pre:border prose-pre:border-white/10 prose-code:text-[#00F0FF] prose-headings:font-display prose-p:leading-relaxed">
          <ReactMarkdown>{msg.text}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function StreamBubble({ text, meta }) {
  const color = meta.agent_color || "#00F0FF";
  return (
    <div className="flex justify-start" data-testid="stream-bubble">
      <div className="max-w-[85%] border border-white/10 rounded-md px-4 py-2.5 bg-[#0a0a0c]">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />
          <div className="text-[10px] uppercase tracking-[0.15em]" style={{ color }}>
            {meta.agent_name}
          </div>
          <span className="text-[9px] uppercase tracking-[0.18em] text-[#00F0FF]">streaming</span>
        </div>
        <div className="prose prose-invert prose-sm max-w-none prose-code:text-[#00F0FF] prose-headings:font-display">
          <ReactMarkdown>{text + "▍"}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
