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
} from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import {
  getSessions,
  getMessages,
  sendChat,
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
  const [selectedAgent, setSelectedAgent] = useState(""); // "" = orchestrator routes
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const refreshSessions = async () => {
    const r = await getSessions();
    setSessions(r.sessions || []);
  };
  const loadMessages = async (sid) => {
    if (!sid) {
      setMessages([]);
      return;
    }
    const r = await getMessages(sid);
    setMessages(r.messages || []);
  };

  useEffect(() => {
    getAgents()
      .then((r) => setAgents(r.agents || []))
      .catch(() => {});
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
  }, [messages]);

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

  const send = async (e) => {
    e?.preventDefault();
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    // optimistic user msg
    const tmpId = `tmp-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: tmpId, role: "user", text, ts: new Date().toISOString() },
    ]);

    try {
      const r = await sendChat(text, activeSession, selectedAgent || null);
      if (!activeSession) {
        setActiveSession(r.session_id);
        refreshSessions();
      } else {
        refreshSessions();
      }
      setMessages((m) => {
        const without = m.filter((x) => x.id !== tmpId);
        return [...without, r.user_message, r.agent_message];
      });
    } catch (err) {
      toast.error("Request failed: " + (err?.response?.data?.error || err.message));
      setMessages((m) => m.filter((x) => x.id !== tmpId));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="px-6 py-3 border-b border-white/10 bg-[#050505]/80 backdrop-blur flex items-center justify-between sticky top-0 z-10">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Orchestration Console
          </div>
          <div className="font-display text-lg">Tactical Chat</div>
        </div>
        <button
          onClick={newSession}
          data-testid="new-session-button"
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border border-white/10 hover:border-[#00F0FF]/50 hover:text-[#00F0FF] rounded-md transition-colors"
        >
          <Plus size={14} weight="bold" /> NEW SESSION
        </button>
      </div>

      <div className="flex-1 grid grid-cols-12 min-h-0">
        {/* Sessions rail */}
        <div className="col-span-3 border-r border-white/10 bg-[#0a0a0c] overflow-y-auto">
          <div className="px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-zinc-500 border-b border-white/5">
            Sessions ({sessions.length})
          </div>
          {sessions.length === 0 && (
            <div className="p-4 text-xs text-zinc-500 font-mono">
              No sessions yet. Send a message or click NEW SESSION.
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

        {/* Chat */}
        <div className="col-span-9 flex flex-col min-h-0 bg-[#050505]">
          <div
            ref={scrollRef}
            data-testid="chat-messages"
            className="flex-1 overflow-y-auto px-8 py-6 space-y-4"
          >
            {messages.length === 0 && (
              <div className="text-center text-zinc-500 mt-20 font-mono text-xs space-y-1">
                <div className="text-[#00F0FF] text-sm mb-2">// READY</div>
                <div>
                  Issue a command. The orchestrator will route to a specialist agent.
                </div>
                <div>Try: "Analyze CVE-2024-3094" · "Write a port scanner in Python" · "Generate a SOC report on supply chain risk"</div>
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} agents={agents} />
            ))}
            {sending && (
              <div className="text-xs font-mono text-[#00F0FF] flex items-center gap-2 pl-1">
                <span className="inline-block w-1.5 h-3 bg-[#00F0FF] animate-pulse" />
                routing through orchestrator…
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={send}
            className="border-t border-white/10 bg-[#0a0a0c] p-4"
          >
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Target Agent
              </span>
              <button
                type="button"
                onClick={() => setSelectedAgent("")}
                data-testid="agent-chip-auto"
                className={`text-[11px] font-mono px-2 py-0.5 rounded border transition ${
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
                    className={`text-[11px] font-mono px-2 py-0.5 rounded border transition ${
                      selectedAgent === a.id
                        ? "text-black border-transparent"
                        : "border-white/10 hover:border-white/30 text-zinc-400"
                    }`}
                    style={
                      selectedAgent === a.id
                        ? { background: a.color }
                        : undefined
                    }
                  >
                    {a.name.replace(" Agent", "").toUpperCase()}
                  </button>
                ))}
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
                DISPATCH
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg, agents }) {
  const isUser = msg.role === "user";
  if (isUser) {
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
  return (
    <div className="flex justify-start" data-testid={`message-agent-${msg.agent}`}>
      <div className="max-w-[80%] border border-white/10 rounded-md px-4 py-2.5 bg-[#0a0a0c]">
        <div className="flex items-center gap-2 mb-1.5">
          <Icon size={14} weight="bold" style={{ color }} />
          <div
            className="text-[10px] uppercase tracking-[0.15em]"
            style={{ color }}
          >
            {msg.agent_name || msg.agent}
          </div>
          <div className="text-[10px] text-zinc-600 font-mono">
            {new Date(msg.ts).toLocaleTimeString()}
          </div>
        </div>
        <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-[#050505] prose-pre:border prose-pre:border-white/10 prose-code:text-[#00F0FF] prose-headings:font-display prose-p:leading-relaxed">
          <ReactMarkdown>{msg.text}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
