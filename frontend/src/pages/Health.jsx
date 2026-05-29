import { useEffect, useState } from "react";
import { getHealth, getTelegramStatus } from "@/lib/api";
import { Pulse, Database, Brain, PaperPlaneRight } from "@phosphor-icons/react";

function Stat({ label, value, ok, accent = "#00F0FF" }) {
  return (
    <div className="border border-white/10 rounded-md p-5 bg-[#0a0a0c]">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: ok ? "#00E676" : "#FF3333" }}
        />
        <span className="font-mono text-sm" style={{ color: accent }}>
          {value}
        </span>
      </div>
    </div>
  );
}

export default function Health() {
  const [h, setH] = useState(null);
  const [tg, setTg] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setH(await getHealth());
        setTg(await getTelegramStatus());
      } catch {}
    };
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="p-8" data-testid="health-page">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Telemetry
        </div>
        <h1 className="font-display text-2xl">System Health</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat
          label="Gateway"
          value={h?.status?.toUpperCase() || "…"}
          ok={h?.status === "ok"}
        />
        <Stat label="MongoDB" value={h?.mongo ? "CONNECTED" : "DOWN"} ok={!!h?.mongo} />
        <Stat
          label="LLM Provider"
          value={(h?.llm?.active_provider || "n/a").toUpperCase()}
          ok={!!(h?.llm?.emergent_configured || h?.llm?.ollama_configured)}
        />
        <Stat
          label="Telegram"
          value={h?.telegram_configured ? "CONFIGURED" : "STUB"}
          ok={!!h?.telegram_configured}
          accent="#FFB000"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-white/10 rounded-md p-5 bg-[#0a0a0c]">
          <div className="flex items-center gap-2 mb-3">
            <Brain size={16} className="text-[#00F0FF]" />
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              LLM Configuration
            </div>
          </div>
          <pre className="font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
{JSON.stringify(h?.llm || {}, null, 2)}
          </pre>
        </div>

        <div className="border border-white/10 rounded-md p-5 bg-[#0a0a0c]">
          <div className="flex items-center gap-2 mb-3">
            <PaperPlaneRight size={16} className="text-[#FFB000]" />
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Telegram Interface (stub)
            </div>
          </div>
          <div className="text-xs text-zinc-400 mb-3">
            {tg?.note || "Configure TELEGRAM_BOT_TOKEN in backend/.env to enable."}
          </div>
          <div className="space-y-1">
            {(tg?.supported_commands || []).map((c) => (
              <div key={c} className="font-mono text-[11px] text-[#00F0FF]">
                {c}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
