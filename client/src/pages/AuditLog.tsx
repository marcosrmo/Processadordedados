import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList, RefreshCw, Search, AlertCircle,
  LogIn, LogOut, UserPlus, Ban, CheckCircle2,
  Trash2, ShieldAlert, XCircle, Filter, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

interface AuditEntry {
  id: string;
  actorId: string | null;
  actorUsername: string;
  action: string;
  targetId: string | null;
  targetUsername: string | null;
  details: string | null;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  createdAt: string;
}

const ACTION_META: Record<string, { label: string; icon: React.FC<any>; color: string; bg: string }> = {
  LOGIN_SUCCESS:          { label: "Login efetuado",         icon: LogIn,       color: "text-green-500",  bg: "bg-green-500/10 border-green-500/30" },
  LOGIN_FAILED:           { label: "Senha incorreta",        icon: XCircle,     color: "text-red-500",    bg: "bg-red-500/10 border-red-500/30" },
  LOGIN_BLOCKED:          { label: "Login bloqueado",        icon: Ban,         color: "text-red-600",    bg: "bg-red-600/10 border-red-600/30" },
  LOGOUT:                 { label: "Logout",                 icon: LogOut,      color: "text-slate-400",  bg: "bg-slate-500/10 border-slate-500/20" },
  REGISTER:               { label: "Cadastro",               icon: UserPlus,    color: "text-blue-500",   bg: "bg-blue-500/10 border-blue-500/30" },
  USER_BLOCKED:           { label: "Usuário bloqueado",      icon: ShieldAlert, color: "text-amber-500",  bg: "bg-amber-500/10 border-amber-500/30" },
  USER_UNBLOCKED:         { label: "Usuário desbloqueado",   icon: CheckCircle2,color: "text-emerald-500",bg: "bg-emerald-500/10 border-emerald-500/30" },
  USER_DELETED:           { label: "Usuário removido",       icon: Trash2,      color: "text-red-600",    bg: "bg-red-600/10 border-red-600/30" },
  SESSION_EXPIRED_BLOCKED:{ label: "Sessão expirada (bloq)", icon: Ban,         color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/30" },
};

const PAGE_SIZE = 20;

const ALL_ACTIONS = Object.keys(ACTION_META);

export default function AuditLog() {
  const { user } = useAuth();
  const [logs, setLogs]       = useState<AuditEntry[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [filterAction, setFilterAction] = useState("ALL");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page:   String(page),
        limit:  String(PAGE_SIZE),
        search,
        action: filterAction,
      });
      const res = await fetch(`/api/audit/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotal(data.total);
      }
    } catch {}
    setLoading(false);
  }, [page, search, filterAction]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Reset page quando filtro muda
  useEffect(() => { setPage(1); }, [search, filterAction]);

  if (user?.role !== "admin") {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <ShieldAlert size={48} className="text-destructive/60" />
        <p className="text-lg font-medium">Acesso restrito a administradores</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-8 space-y-5 min-h-full overflow-y-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="text-primary" size={24} />
          Log de Auditoria
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Todas as ações registradas no sistema — logins, bloqueios, remoções e mais.
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
          {/* Busca */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por usuário, IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>

          {/* Filtro de ação */}
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-muted-foreground" />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="text-xs border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
              <option value="ALL">Todas as ações</option>
              {ALL_ACTIONS.map((a) => (
                <option key={a} value={a}>{ACTION_META[a]?.label ?? a}</option>
              ))}
            </select>
          </div>

          <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={loading} className="h-7 gap-1 text-xs">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Atualizar
          </Button>

          <span className="text-xs text-muted-foreground ml-auto">
            {total} registro{total !== 1 ? "s" : ""}
          </span>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader className="py-2.5 px-4 border-b">
          <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-4">
            <span className="w-36">Data / Hora</span>
            <span className="w-28">Ação</span>
            <span className="w-28">Executor</span>
            <span className="w-28">Alvo</span>
            <span className="flex-1">Detalhes</span>
            <span className="w-28 text-right">IP</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-14 text-muted-foreground gap-2 text-sm">
              <RefreshCw size={16} className="animate-spin" /> Carregando...
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground text-sm">
              <ClipboardList size={32} className="mx-auto mb-2 opacity-30" />
              Nenhum registro encontrado.
            </div>
          ) : (
            <AnimatePresence>
              {logs.map((log, idx) => {
                const meta = ACTION_META[log.action] ?? {
                  label: log.action,
                  icon: AlertCircle,
                  color: "text-muted-foreground",
                  bg: "bg-muted border-border",
                };
                const Icon = meta.icon;
                const dt = new Date(log.createdAt);

                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.015 }}
                    className={`flex items-center gap-4 px-4 py-2.5 border-b last:border-0 text-xs hover:bg-muted/20 transition-colors ${
                      !log.success ? "bg-red-500/5" : ""
                    }`}
                  >
                    {/* Data/hora */}
                    <div className="w-36 shrink-0">
                      <span className="text-foreground font-mono">
                        {dt.toLocaleDateString("pt-BR")}
                      </span>
                      <br />
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {dt.toLocaleTimeString("pt-BR")}
                      </span>
                    </div>

                    {/* Badge de ação */}
                    <div className="w-28 shrink-0">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${meta.bg} ${meta.color}`}>
                        <Icon size={9} />
                        {meta.label}
                      </span>
                    </div>

                    {/* Executor */}
                    <div className="w-28 shrink-0 font-medium text-foreground truncate">
                      {log.actorUsername}
                    </div>

                    {/* Alvo */}
                    <div className="w-28 shrink-0 text-muted-foreground truncate">
                      {log.targetUsername ?? "—"}
                    </div>

                    {/* Detalhes */}
                    <div className="flex-1 text-muted-foreground truncate" title={log.details ?? ""}>
                      {log.details ?? "—"}
                    </div>

                    {/* IP */}
                    <div className="w-28 text-right font-mono text-[10px] text-muted-foreground truncate">
                      {log.ip ?? "—"}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline" size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="h-7 gap-1 text-xs"
          >
            <ChevronLeft size={12} /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline" size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="h-7 gap-1 text-xs"
          >
            Próxima <ChevronRight size={12} />
          </Button>
        </div>
      )}

      {/* Legenda */}
      <Card className="border-slate-200/20">
        <CardHeader className="py-2 px-4">
          <CardDescription className="text-[10px]">Legenda de ações</CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 flex flex-wrap gap-2">
          {ALL_ACTIONS.map((a) => {
            const m = ACTION_META[a];
            const I = m.icon;
            return (
              <span key={a} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${m.bg} ${m.color}`}>
                <I size={9} /> {m.label}
              </span>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
