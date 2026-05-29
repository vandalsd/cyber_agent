import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getReports } from "@/lib/api";
import { FileText } from "@phosphor-icons/react";

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    getReports().then((r) => {
      setReports(r.reports || []);
      if (r.reports?.length) setActive(r.reports[0]);
    });
  }, []);

  return (
    <div className="h-screen flex flex-col" data-testid="reports-page">
      <div className="px-6 py-3 border-b border-white/10 bg-[#050505]/80 backdrop-blur sticky top-0 z-10">
        <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Documentation
        </div>
        <h1 className="font-display text-lg">Generated Reports</h1>
      </div>
      <div className="flex-1 grid grid-cols-12 min-h-0">
        <div className="col-span-4 border-r border-white/10 bg-[#0a0a0c] overflow-y-auto">
          {reports.length === 0 && (
            <div className="p-6 text-xs text-zinc-500 font-mono">
              No reports yet. Ask the Report Agent in the Console — e.g. "Generate a
              SOC report on phishing campaign IOCs."
            </div>
          )}
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => setActive(r)}
              data-testid={`report-item-${r.id}`}
              className={`w-full text-left px-4 py-3 border-b border-white/5 transition ${
                active?.id === r.id
                  ? "bg-[#121214] border-l-2 border-l-[#FF3333]"
                  : "hover:bg-[#121214]/60 border-l-2 border-l-transparent"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <FileText size={14} className="text-[#FF3333]" />
                <div className="text-sm truncate">{r.title}</div>
              </div>
              <div className="text-[10px] text-zinc-500 font-mono">
                {new Date(r.created_at).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
        <div className="col-span-8 overflow-y-auto px-10 py-8 bg-[#050505]">
          {active ? (
            <article className="prose prose-invert prose-sm max-w-3xl prose-headings:font-display prose-pre:bg-[#0a0a0c] prose-pre:border prose-pre:border-white/10 prose-code:text-[#00F0FF]">
              <h2>{active.title}</h2>
              <ReactMarkdown>{active.markdown}</ReactMarkdown>
            </article>
          ) : (
            <div className="text-zinc-500 text-sm font-mono">Select a report.</div>
          )}
        </div>
      </div>
    </div>
  );
}
