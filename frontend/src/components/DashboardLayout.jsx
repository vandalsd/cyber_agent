import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Terminal,
  GridFour,
  ClockCounterClockwise,
  FileText,
  ListMagnifyingGlass,
  Pulse,
  SignOut,
} from "@phosphor-icons/react";
import { clearToken } from "@/lib/api";
import { useEffect, useState } from "react";
import { getHealth } from "@/lib/api";
import CommandPalette from "@/components/CommandPalette";

const LOGO_URL =
  "https://static.prod-images.emergentagent.com/jobs/48a92173-0bbb-4006-bdf0-a4dec7cb14c0/images/a3b32859667c42455cb9d590ac2376a69ba6b48abf4dc790394e2d4f74a65fd5.png";

const NAV = [
  { to: "/", label: "Console", icon: Terminal, end: true, tid: "nav-console" },
  { to: "/agents", label: "Agents", icon: GridFour, tid: "nav-agents" },
  { to: "/sessions", label: "Sessions", icon: ClockCounterClockwise, tid: "nav-sessions" },
  { to: "/reports", label: "Reports", icon: FileText, tid: "nav-reports" },
  { to: "/logs", label: "Forensic Logs", icon: ListMagnifyingGlass, tid: "nav-logs" },
  { to: "/health", label: "System Health", icon: Pulse, tid: "nav-health" },
];

export default function DashboardLayout() {
  const nav = useNavigate();
  const [health, setHealth] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const h = await getHealth();
        if (mounted) setHealth(h);
      } catch {}
    };
    load();
    const i = setInterval(load, 15000);
    return () => {
      mounted = false;
      clearInterval(i);
    };
  }, []);

  const logout = () => {
    clearToken();
    nav("/login");
  };

  return (
    <div className="min-h-screen flex bg-[#050505] text-white relative">
      {/* Sidebar */}
      <aside
        className="w-60 shrink-0 border-r border-white/10 bg-[#0a0a0c] flex flex-col"
        data-testid="sidebar"
      >
        <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
          <img src={LOGO_URL} alt="logo" className="w-8 h-8" />
          <div>
            <div className="font-display text-sm tracking-tight">
              EMERGENT<span className="text-[#00F0FF]">.</span>CYBER
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
              Multi-Agent Console
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV.map(({ to, label, icon: Icon, end, tid }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-testid={tid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150 ${
                  isActive
                    ? "bg-[#121214] text-white border-l-2 border-[#00F0FF]"
                    : "text-zinc-400 hover:text-white hover:bg-[#121214]/60 border-l-2 border-transparent"
                }`
              }
            >
              <Icon size={16} weight="regular" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3 space-y-2">
          <div className="px-2 text-[10px] font-mono text-zinc-500 leading-relaxed">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  health?.status === "ok" ? "bg-[#00E676]" : "bg-[#FFB000]"
                }`}
              />
              <span>GATEWAY {health?.status === "ok" ? "ONLINE" : "DEGRADED"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  health?.llm?.emergent_configured || health?.llm?.ollama_configured
                    ? "bg-[#00E676]"
                    : "bg-[#FF3333]"
                }`}
              />
              <span>LLM · {(health?.llm?.active_provider || "n/a").toUpperCase()}</span>
            </div>
          </div>
          <button
            onClick={logout}
            data-testid="logout-button"
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:text-white hover:bg-[#121214] rounded-md transition-colors"
          >
            <SignOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 relative">
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}
