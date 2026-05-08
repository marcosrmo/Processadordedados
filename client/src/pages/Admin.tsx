import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, Users, Trash2, RefreshCw, Crown,
  Mail, Calendar, AlertCircle, Ban, CheckCircle2,
  ShieldAlert, ShieldOff, UserPlus, Eye, EyeOff, KeyRound,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface UserRow {
  id: string;
  username: string;
  email: string;
  role: string;
  blocked: boolean;
  blockedAt: string | null;
  createdAt: string;
}

const EMPTY_FORM = { username: "", email: "", password: "", role: "user" };

export default function Admin() {
  const { user } = useAuth();
  const [userList, setUserList] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const { toast } = useToast();

  // Adicionar usuário
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPass, setShowPass] = useState(false);
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");

  // Redefinir senha
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/users");
      if (res.ok) setUserList(await res.json());
    } catch {}
    setLoading(false);
  };

  const doAction = async (
    url: string,
    method: string,
    id: string,
    successMsg: string,
    confirmMsg?: string
  ) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setActionId(id);
    try {
      const res = await fetch(url, { method });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Erro", description: data.error });
      } else {
        toast({ title: successMsg });
        fetchUsers();
      }
    } catch {
      toast({ variant: "destructive", title: "Falha de comunicação com o servidor" });
    }
    setActionId(null);
  };

  const blockUser   = (id: string, name: string) =>
    doAction(`/api/auth/users/${id}/block`,   "PATCH",  id, `Usuário "${name}" bloqueado`,
      `Bloquear "${name}"? Ele não conseguirá mais fazer login.`);

  const unblockUser = (id: string, name: string) =>
    doAction(`/api/auth/users/${id}/unblock`, "PATCH",  id, `Usuário "${name}" desbloqueado`);

  const removeUser  = (id: string, name: string) =>
    doAction(`/api/auth/users/${id}`,         "DELETE", id, `Usuário "${name}" removido permanentemente`,
      `⚠ REMOVER PERMANENTEMENTE "${name}"?\n\nEsta ação é irreversível e apaga o usuário do banco de dados.`);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormError("");
    setShowPass(false);
    setAddOpen(true);
  };

  const openReset = (u: UserRow) => {
    setResetTarget(u);
    setNewPassword("");
    setShowNewPass(false);
    setResetError("");
  };

  const handleResetPassword = async () => {
    setResetError("");
    if (newPassword.length < 6) {
      setResetError("Senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setResetting(true);
    try {
      const res = await fetch(`/api/auth/users/${resetTarget!.id}/reset-password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetError(data.error ?? "Erro ao redefinir senha.");
      } else {
        toast({ title: `Senha de "${resetTarget!.username}" redefinida com sucesso!` });
        setResetTarget(null);
      }
    } catch {
      setResetError("Falha de comunicação com o servidor.");
    }
    setResetting(false);
  };

  const handleAddUser = async () => {
    setFormError("");
    if (!form.username.trim() || !form.email.trim() || !form.password.trim()) {
      setFormError("Preencha todos os campos.");
      return;
    }
    if (form.password.length < 6) {
      setFormError("Senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Erro ao criar usuário.");
      } else {
        toast({ title: `Usuário "${data.user.username}" criado com sucesso!` });
        setAddOpen(false);
        fetchUsers();
      }
    } catch {
      setFormError("Falha de comunicação com o servidor.");
    }
    setAdding(false);
  };

  if (user?.role !== "admin") {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <ShieldAlert size={48} className="text-destructive/60" />
        <p className="text-lg font-medium">Acesso restrito a administradores</p>
      </div>
    );
  }

  const activeCount  = userList.filter(u => !u.blocked && u.role !== "admin").length;
  const blockedCount = userList.filter(u => u.blocked).length;

  return (
    <div className="p-8 space-y-6 min-h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="text-primary" size={24} />
            Painel de Administração
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie e controle todos os acessos ao sistema.
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <UserPlus size={15} /> Adicionar Usuário
        </Button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <Crown size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Logado como</p>
              <p className="font-semibold text-sm">{user?.username}</p>
              <Badge className="mt-0.5 bg-primary/15 text-primary border-primary/30 text-[10px]">Administrador</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200/30 bg-green-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center shrink-0">
              <CheckCircle2 size={18} className="text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Usuários ativos</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{activeCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200/30 bg-red-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
              <Ban size={18} className="text-red-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Usuários bloqueados</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{blockedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de usuários */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b">
          <div>
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Users size={15} /> Todos os Usuários ({userList.length})
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Bloqueados não conseguem fazer login. Remoção é permanente.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchUsers} disabled={loading} className="h-7 gap-1 text-xs">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Atualizar
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2 text-sm">
              <RefreshCw size={16} className="animate-spin" /> Carregando...
            </div>
          ) : userList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhum usuário cadastrado.
            </div>
          ) : (
            <AnimatePresence>
              {userList.map((u, idx) => {
                const isMe    = u.id === user?.id;
                const isAdmin = u.role === "admin";
                const busy    = actionId === u.id;

                return (
                  <motion.div
                    key={u.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`flex items-center justify-between px-4 py-3 border-b last:border-0 transition-colors ${
                      u.blocked ? "bg-red-500/5 hover:bg-red-500/8" : "hover:bg-muted/30"
                    }`}
                  >
                    {/* Avatar + info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border shrink-0 ${
                        u.blocked
                          ? "bg-red-500/10 border-red-500/30 text-red-500"
                          : isAdmin
                            ? "bg-primary/15 border-primary/30 text-primary"
                            : "bg-muted border-border text-muted-foreground"
                      }`}>
                        {u.blocked ? <Ban size={16} /> : u.username[0].toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-sm font-medium ${u.blocked ? "line-through text-muted-foreground" : ""}`}>
                            {u.username}
                          </span>
                          {isAdmin && (
                            <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] px-1.5 py-0">
                              <Crown size={9} className="mr-0.5" /> Admin
                            </Badge>
                          )}
                          {isMe && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Você</Badge>
                          )}
                          {u.blocked && (
                            <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 text-[10px] px-1.5 py-0">
                              <Ban size={9} className="mr-0.5" /> Bloqueado
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Mail size={10} /> {u.email}
                          </span>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Calendar size={10} />
                            Cadastro: {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                          </span>
                          {u.blocked && u.blockedAt && (
                            <span className="text-[11px] text-red-500 flex items-center gap-1">
                              <Ban size={10} />
                              Bloqueado em: {new Date(u.blockedAt).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ações — só para outros usuários não-admin */}
                    {!isMe && !isAdmin && (
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {u.blocked ? (
                          <Button
                            variant="ghost" size="sm" disabled={busy}
                            onClick={() => unblockUser(u.id, u.username)}
                            className="h-7 px-2 gap-1 text-xs text-green-600 hover:text-green-600 hover:bg-green-500/10"
                          >
                            {busy ? <RefreshCw size={12} className="animate-spin" /> : <><CheckCircle2 size={12} /> Desbloquear</>}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost" size="sm" disabled={busy}
                            onClick={() => blockUser(u.id, u.username)}
                            className="h-7 px-2 gap-1 text-xs text-amber-600 hover:text-amber-600 hover:bg-amber-500/10"
                          >
                            {busy ? <RefreshCw size={12} className="animate-spin" /> : <><ShieldOff size={12} /> Bloquear</>}
                          </Button>
                        )}
                        <Button
                          variant="ghost" size="icon" disabled={busy}
                          onClick={() => openReset(u)}
                          className="h-7 w-7 text-blue-500 hover:bg-blue-500/10"
                          title="Redefinir senha"
                        >
                          <KeyRound size={13} />
                        </Button>
                        <Button
                          variant="ghost" size="icon" disabled={busy}
                          onClick={() => removeUser(u.id, u.username)}
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          title="Remover permanentemente"
                        >
                          {busy ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={13} />}
                        </Button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </CardContent>
      </Card>

      {/* Aviso de segurança */}
      <Card className="border-amber-200/30 bg-amber-500/5">
        <CardContent className="p-4">
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>
              <strong>Regras de segurança:</strong>{" "}
              Usuários bloqueados perdem acesso imediatamente — sessão ativa é encerrada no próximo request.
              Remoção é permanente e irreversível. Administradores não podem ser bloqueados nem removidos.
              Senhas armazenadas com hash bcrypt (salt 12).
            </span>
          </p>
        </CardContent>
      </Card>

      {/* DIALOG — Redefinir Senha */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!resetting && !o) setResetTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound size={18} /> Redefinir Senha
            </DialogTitle>
            <DialogDescription>
              Defina uma nova senha para <strong>{resetTarget?.username}</strong>. O usuário deverá usar essa senha no próximo login.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="reset-password">Nova Senha <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Input
                  id="reset-password"
                  type={showNewPass ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  disabled={resetting}
                  autoComplete="new-password"
                  className="pr-10"
                  onKeyDown={e => { if (e.key === "Enter") handleResetPassword(); }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNewPass(v => !v)}
                  tabIndex={-1}
                >
                  {showNewPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {resetError && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle size={14} /> {resetError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={resetting}>
              Cancelar
            </Button>
            <Button onClick={handleResetPassword} disabled={resetting} className="gap-2">
              {resetting
                ? <><RefreshCw size={14} className="animate-spin" /> Salvando...</>
                : <><KeyRound size={14} /> Salvar Nova Senha</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG — Adicionar Usuário */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!adding) setAddOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus size={18} /> Adicionar Usuário
            </DialogTitle>
            <DialogDescription>
              Crie uma conta manualmente. O usuário poderá fazer login imediatamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Usuário */}
            <div className="space-y-1.5">
              <Label htmlFor="new-username">Usuário <span className="text-destructive">*</span></Label>
              <Input
                id="new-username"
                placeholder="ex: joao.silva"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                disabled={adding}
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground">Será convertido para letras minúsculas.</p>
            </div>

            {/* E-mail */}
            <div className="space-y-1.5">
              <Label htmlFor="new-email">E-mail <span className="text-destructive">*</span></Label>
              <Input
                id="new-email"
                type="email"
                placeholder="ex: joao@empresa.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                disabled={adding}
                autoComplete="off"
              />
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Senha <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPass ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  disabled={adding}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPass(v => !v)}
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Papel */}
            <div className="space-y-1.5">
              <Label>Papel</Label>
              <Select
                value={form.role}
                onValueChange={v => setForm(f => ({ ...f, role: v }))}
                disabled={adding}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário comum</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Erro */}
            {formError && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle size={14} /> {formError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancelar
            </Button>
            <Button onClick={handleAddUser} disabled={adding} className="gap-2">
              {adding
                ? <><RefreshCw size={14} className="animate-spin" /> Criando...</>
                : <><UserPlus size={14} /> Criar Usuário</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
