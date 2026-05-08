import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Eye, EyeOff, LogIn, UserPlus, Loader2, Lock, User, Mail, Ban } from "lucide-react";
import { checkAuth } from "@/hooks/useAuth";

interface Props {
  onAuth: () => void;
  blocked?: boolean;
}

export default function Login({ onAuth, blocked: wasBlocked }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const reset = () => {
    setError("");
    setSuccess("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (mode === "login") {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Erro ao entrar"); return; }
        await checkAuth();
        onAuth();
      } else {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Erro ao cadastrar"); return; }
        setSuccess(
          data.user?.role === "admin"
            ? "✓ Conta criada! Você é o primeiro usuário — acesso de Administrador concedido."
            : "✓ Conta criada com sucesso!"
        );
        await checkAuth();
        setTimeout(() => onAuth(), 1200);
      }
    } catch {
      setError("Falha de conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 relative overflow-hidden">
      {/* Background decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
        {/* Grade */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-md mx-4"
      >
        {/* Card principal */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 text-center border-b border-white/5">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 mb-4 shadow-lg shadow-primary/20">
              <ShieldCheck size={32} className="text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-white">DataForge</h1>
            <p className="text-slate-400 text-sm mt-1">Sistema de Consolidação de Dados</p>
          </div>

          {/* Tabs login/cadastro */}
          <div className="flex border-b border-white/5">
            {(["login", "register"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setMode(tab); reset(); }}
                className={`flex-1 py-3 text-sm font-medium transition-all ${
                  mode === tab
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {tab === "login" ? (
                  <span className="flex items-center justify-center gap-1.5"><LogIn size={14} /> Entrar</span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5"><UserPlus size={14} /> Criar Conta</span>
                )}
              </button>
            ))}
          </div>

          {/* Formulário */}
          <form onSubmit={submit} className="px-8 py-6 space-y-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: mode === "login" ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Campo Usuário */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                    Usuário
                  </label>
                  <div className="relative">
                    <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="seu.usuario"
                      autoComplete="username"
                      required
                      className="w-full bg-slate-800/60 border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition"
                    />
                  </div>
                </div>

                {/* Campo Email (só no cadastro) */}
                {mode === "register" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                      E-mail
                    </label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        autoComplete="email"
                        required
                        className="w-full bg-slate-800/60 border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition"
                      />
                    </div>
                  </motion.div>
                )}

                {/* Campo Senha */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                    Senha
                  </label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "register" ? "Mínimo 6 caracteres" : "••••••••"}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      required
                      className="w-full bg-slate-800/60 border border-white/10 rounded-lg pl-9 pr-10 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Banner de bloqueio */}
            {wasBlocked && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 p-3 rounded-lg bg-red-500/15 border border-red-500/40 text-red-400 text-xs"
              >
                <Ban size={14} className="shrink-0 mt-0.5" />
                <span>
                  <strong>Conta bloqueada.</strong> Sua conta foi bloqueada pelo administrador.
                  Você não pode fazer login até ser desbloqueado.
                </span>
              </motion.div>
            )}

            {/* Feedback */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs"
                >
                  <span className="mt-0.5">⚠</span>
                  <span>{error}</span>
                </motion.div>
              )}
              {success && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs"
                >
                  <span>{success}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Botão submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-primary/25 mt-2"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Aguarde...</>
              ) : mode === "login" ? (
                <><LogIn size={16} /> Entrar no Sistema</>
              ) : (
                <><UserPlus size={16} /> Criar Conta</>
              )}
            </button>

            {/* Aviso primeiro usuário */}
            {mode === "register" && (
              <p className="text-center text-[11px] text-slate-600">
                O primeiro usuário cadastrado receberá automaticamente acesso de <span className="text-primary">Administrador</span>.
              </p>
            )}
          </form>
        </div>

        {/* Rodapé */}
        <p className="text-center text-slate-700 text-xs mt-4">
          DataForge © {new Date().getFullYear()} — Acesso Restrito
        </p>
      </motion.div>
    </div>
  );
}
