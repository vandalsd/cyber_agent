import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck, ArrowRight } from "@phosphor-icons/react";

const BG_URL =
  "https://static.prod-images.emergentagent.com/jobs/48a92173-0bbb-4006-bdf0-a4dec7cb14c0/images/1dd2be2b7f7ebe5295b4f8adaede489c5b575c721271d456839c2abc1861cdd9.png";
const LOGO_URL =
  "https://static.prod-images.emergentagent.com/jobs/48a92173-0bbb-4006-bdf0-a4dec7cb14c0/images/a3b32859667c42455cb9d590ac2376a69ba6b48abf4dc790394e2d4f74a65fd5.png";

export default function Login() {
  const [token, setTok] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!token.trim()) {
      toast.error("Token required");
      return;
    }
    setLoading(true);
    try {
      await login(token.trim());
      toast.success("Operator authenticated");
      nav("/");
    } catch (err) {
      toast.error("Invalid token — access denied");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center relative"
      data-testid="login-screen"
      style={{
        backgroundImage: `url(${BG_URL})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative z-10 w-full max-w-md mx-auto px-6">
        <div className="border border-white/10 bg-[#0a0a0c]/90 backdrop-blur-md rounded-md p-8 scanline">
          <div className="flex items-center gap-3 mb-8">
            <img src={LOGO_URL} alt="logo" className="w-10 h-10" />
            <div>
              <div className="font-display text-lg tracking-tight">
                EMERGENT<span className="text-[#00F0FF]">.</span>CYBER
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Multi-Agent Orchestration · v1.0
              </div>
            </div>
          </div>

          <div className="text-xs uppercase tracking-[0.2em] text-zinc-400 mb-2">
            Operator Authentication
          </div>
          <h1 className="font-display text-2xl mb-6">Access Gateway</h1>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-[11px] uppercase tracking-[0.15em] text-zinc-500 block mb-2">
                Bearer Token
              </label>
              <input
                data-testid="login-token-input"
                autoFocus
                type="password"
                value={token}
                onChange={(e) => setTok(e.target.value)}
                placeholder="paste your AUTH_TOKEN…"
                className="w-full bg-[#050505] border border-white/10 rounded-md px-3 py-2.5 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#00F0FF]/60 focus:border-[#00F0FF]/40 transition-colors duration-150"
              />
            </div>

            <button
              data-testid="login-submit-button"
              disabled={loading}
              type="submit"
              className="w-full group flex items-center justify-between bg-[#00F0FF] text-black font-medium px-4 py-2.5 rounded-md hover:bg-white transition-colors duration-150 disabled:opacity-60"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck size={18} weight="bold" />
                {loading ? "AUTHENTICATING…" : "AUTHENTICATE"}
              </span>
              <ArrowRight size={16} weight="bold" className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-white/5 text-[10px] text-zinc-500 font-mono leading-relaxed">
            Authorized use only. All sessions are logged.
            <br />
            Default token in dev: <span className="text-[#00F0FF]">emergent-cyber-token-2026</span>
          </div>
        </div>
      </div>
    </div>
  );
}
