import { useEffect, useState } from "react";
import { getLogs } from "@/lib/api";

const LEVELS = ["", "INFO", "WARN", "ERROR"];

const LEVEL_COLOR = {
  INFO: "#00F0FF",
  WARN: "#FFB000",
  ERROR: "#FF3333",
  DEBUG: "#71717A",
};

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [level, setLevel] = useState("");

  const load = async () => {
    const r = await getLogs(level || undefined);
    setLogs(r.logs || []);
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
    // eslint-disable-next-line
  }, [level]);

  return (
    <div className="p-8" data-testid="logs-page">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Audit Trail
          </div>
          <h1 className="font-display text-2xl">Forensic Logs</h1>
        </div>
        <div className="flex items-center gap-1">
          {LEVELS.map((l) => (
            <button
              key={l || "ALL"}
              onClick={() => setLevel(l)}
              data-testid={`log-filter-${l || "all"}`}
              className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.15em] rounded border transition ${
                level === l
                  ? "bg-[#00F0FF] text-black border-[#00F0FF]"
                  : "border-white/10 hover:border-white/30 text-zinc-400"
              }`}
            >
              {l || "ALL"}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-white/10 rounded-md bg-[#050505] font-mono text-xs overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto">
          {logs.length === 0 && (
            <div className="p-6 text-zinc-500">No logs.</div>
          )}
          {logs.map((l) => (
            <div
              key={l.id}
              data-testid={`log-row-${l.id}`}
              className="grid grid-cols-12 gap-2 px-4 py-1.5 border-b border-white/5 hover:bg-[#0a0a0c] leading-tight"
            >
              <div className="col-span-2 text-zinc-500">
                {new Date(l.ts).toLocaleTimeString()}
              </div>
              <div
                className="col-span-1"
                style={{ color: LEVEL_COLOR[l.level] || "#A1A1AA" }}
              >
                {l.level}
              </div>
              <div className="col-span-2 text-zinc-400">{l.source}</div>
              <div className="col-span-7 text-white truncate">{l.message}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
