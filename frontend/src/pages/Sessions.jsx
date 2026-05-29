import { useEffect, useState } from "react";
import { getSessions, deleteSession } from "@/lib/api";
import { Link } from "react-router-dom";
import { Trash, ArrowRight } from "@phosphor-icons/react";

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const load = () => getSessions().then((r) => setSessions(r.sessions || []));
  useEffect(() => {
    load();
  }, []);

  const remove = async (id) => {
    await deleteSession(id);
    load();
  };

  return (
    <div className="p-8" data-testid="sessions-page">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Persistence
        </div>
        <h1 className="font-display text-2xl">Sessions</h1>
      </div>

      <div className="border border-white/10 rounded-md overflow-hidden bg-[#0a0a0c]">
        <div className="grid grid-cols-12 px-4 py-2.5 text-[10px] uppercase tracking-[0.15em] text-zinc-500 border-b border-white/5 font-mono">
          <div className="col-span-6">Title</div>
          <div className="col-span-2">Messages</div>
          <div className="col-span-3">Updated</div>
          <div className="col-span-1" />
        </div>
        {sessions.length === 0 && (
          <div className="p-6 text-xs text-zinc-500 font-mono">
            No sessions recorded.
          </div>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            data-testid={`session-row-${s.id}`}
            className="grid grid-cols-12 px-4 py-3 items-center border-b border-white/5 hover:bg-[#121214]/60 transition-colors"
          >
            <div className="col-span-6 truncate text-sm">{s.title}</div>
            <div className="col-span-2 font-mono text-xs text-zinc-400">
              {s.message_count}
            </div>
            <div className="col-span-3 font-mono text-xs text-zinc-500">
              {new Date(s.updated_at).toLocaleString()}
            </div>
            <div className="col-span-1 flex items-center justify-end gap-2">
              <Link to="/" className="text-zinc-500 hover:text-[#00F0FF]">
                <ArrowRight size={14} />
              </Link>
              <button onClick={() => remove(s.id)} className="text-zinc-500 hover:text-[#FF3333]">
                <Trash size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
