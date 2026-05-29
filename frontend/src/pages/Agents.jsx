import { useEffect, useState } from "react";
import {
  Brain,
  Crosshair,
  Bug,
  Code,
  Database,
  FileText,
  ChatCircleText,
} from "@phosphor-icons/react";
import { getAgents } from "@/lib/api";

const ICONS = {
  Brain,
  Crosshair,
  Bug,
  Code,
  Database,
  FileText,
  MessageSquare: ChatCircleText,
};

export default function Agents() {
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    getAgents()
      .then((r) => setAgents(r.agents || []))
      .catch(() => {});
  }, []);

  return (
    <div className="p-8" data-testid="agents-page">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Agent Mesh
        </div>
        <h1 className="font-display text-2xl">Specialist Agents</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Seven autonomous reasoning units. The orchestrator routes requests to the right specialist.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((a) => {
          const Icon = ICONS[a.icon] || ChatCircleText;
          return (
            <div
              key={a.id}
              data-testid={`agent-card-${a.id}`}
              className="group border border-white/10 bg-[#0a0a0c] rounded-md p-5 transition-all duration-150 hover:border-white/30 hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-md border flex items-center justify-center"
                  style={{
                    borderColor: a.color + "40",
                    background: a.color + "10",
                  }}
                >
                  <Icon size={20} weight="duotone" style={{ color: a.color }} />
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full pulse-dot"
                    style={{ background: "#00E676", color: "#00E676" }}
                  />
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[#00E676]">
                    ONLINE
                  </span>
                </div>
              </div>
              <div className="font-display text-base mb-1">{a.name}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2 font-mono">
                ID: {a.id}
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {a.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
