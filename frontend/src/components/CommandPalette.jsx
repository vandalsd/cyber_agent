import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Command,
  GridFour,
  Terminal,
  FileText,
  ListMagnifyingGlass,
  Pulse,
  ClockCounterClockwise,
  Crosshair,
  Bug,
  Code,
  Database,
  ChatCircleText,
  Brain,
  SignOut,
  Lightning,
  UsersThree,
} from "@phosphor-icons/react";
import { clearToken } from "@/lib/api";

const ITEMS = [
  { id: "go-console", group: "Navigate", label: "Console", icon: Terminal, action: { type: "nav", to: "/" } },
  { id: "go-agents", group: "Navigate", label: "Agents", icon: GridFour, action: { type: "nav", to: "/agents" } },
  { id: "go-sessions", group: "Navigate", label: "Sessions", icon: ClockCounterClockwise, action: { type: "nav", to: "/sessions" } },
  { id: "go-reports", group: "Navigate", label: "Reports", icon: FileText, action: { type: "nav", to: "/reports" } },
  { id: "go-logs", group: "Navigate", label: "Forensic Logs", icon: ListMagnifyingGlass, action: { type: "nav", to: "/logs" } },
  { id: "go-health", group: "Navigate", label: "System Health", icon: Pulse, action: { type: "nav", to: "/health" } },
  { id: "agent-recon", group: "Dispatch · Specialist", label: "Target Recon Agent", icon: Crosshair, action: { type: "agent", agent: "recon" } },
  { id: "agent-exploit", group: "Dispatch · Specialist", label: "Target Exploit Agent", icon: Bug, action: { type: "agent", agent: "exploit" } },
  { id: "agent-code", group: "Dispatch · Specialist", label: "Target Code Agent", icon: Code, action: { type: "agent", agent: "code" } },
  { id: "agent-memory", group: "Dispatch · Specialist", label: "Target Memory Agent", icon: Database, action: { type: "agent", agent: "memory" } },
  { id: "agent-report", group: "Dispatch · Specialist", label: "Target Report Agent", icon: FileText, action: { type: "agent", agent: "report" } },
  { id: "agent-general", group: "Dispatch · Specialist", label: "Target General Agent", icon: ChatCircleText, action: { type: "agent", agent: "general" } },
  { id: "agent-auto", group: "Dispatch · Specialist", label: "Auto-Route (Orchestrator)", icon: Brain, action: { type: "agent", agent: "" } },
  { id: "mode-stream", group: "Mode", label: "Toggle Streaming Mode", icon: Lightning, action: { type: "mode", mode: "stream" } },
  { id: "mode-debate", group: "Mode", label: "Toggle Debate Mode", icon: UsersThree, action: { type: "mode", mode: "debate" } },
  { id: "act-logout", group: "Actions", label: "Sign out", icon: SignOut, action: { type: "logout" } },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const nav = useNavigate();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQ("");
        setActive(0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const ql = q.toLowerCase().trim();
    if (!ql) return ITEMS;
    return ITEMS.filter(
      (i) => i.label.toLowerCase().includes(ql) || i.group.toLowerCase().includes(ql)
    );
  }, [q]);

  const grouped = useMemo(() => {
    const out = {};
    filtered.forEach((i) => {
      out[i.group] = out[i.group] || [];
      out[i.group].push(i);
    });
    return out;
  }, [filtered]);

  const run = (item) => {
    setOpen(false);
    const a = item.action;
    if (a.type === "nav") nav(a.to);
    else if (a.type === "logout") {
      clearToken();
      nav("/login");
    } else if (a.type === "agent" || a.type === "mode") {
      window.dispatchEvent(new CustomEvent("emergent:palette", { detail: a }));
      nav("/");
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[active];
      if (item) run(item);
    }
  };

  if (!open) return null;
  let idx = 0;

  return (
    <div
      data-testid="command-palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/70 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl mx-4 bg-[#0a0a0c] border border-white/15 rounded-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
          <Command size={16} className="text-[#00F0FF]" />
          <input
            data-testid="command-palette-input"
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search commands, agents, modes…"
            className="flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-zinc-600"
          />
          <kbd className="text-[10px] font-mono text-zinc-500 border border-white/10 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>
        <div className="max-h-[55vh] overflow-y-auto py-2">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-2">
              <div className="px-4 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                {group}
              </div>
              {items.map((item) => {
                const Icon = item.icon;
                const myIndex = idx++;
                const isActive = myIndex === active;
                return (
                  <button
                    key={item.id}
                    onClick={() => run(item)}
                    onMouseEnter={() => setActive(myIndex)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                      isActive
                        ? "bg-[#121214] border-l-2 border-l-[#00F0FF]"
                        : "border-l-2 border-l-transparent"
                    }`}
                  >
                    <Icon size={14} className="text-zinc-400" />
                    <span className="text-sm">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-xs text-zinc-500 font-mono text-center">
              no matches
            </div>
          )}
        </div>
        <div className="px-4 py-2 border-t border-white/10 text-[10px] font-mono text-zinc-500 flex items-center justify-between">
          <span>↑↓ navigate · ↵ execute</span>
          <span>⌘K to toggle</span>
        </div>
      </div>
    </div>
  );
}
