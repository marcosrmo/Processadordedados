import { type Express, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq, count } from "drizzle-orm";
import { writeAuditLog } from "./auditLog";

declare module "express-session" {
  interface SessionData {
    userId: string;
    username: string;
    role: string;
  }
}

/* ===========================
   MIDDLEWARE — requer login
=========================== */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Não autenticado" });
  }
  next();
}

/* ===========================
   MIDDLEWARE — requer admin
=========================== */
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) return res.status(401).json({ error: "Não autenticado" });
  if (req.session.role !== "admin") return res.status(403).json({ error: "Acesso negado — apenas administradores" });
  next();
}

/* ===========================
   ROTAS DE AUTH
=========================== */
export function registerAuthRoutes(app: Express) {

  /* ---- ME ---- */
  app.get("/api/auth/me", async (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ authenticated: false });
    }
    try {
      const [user] = await db.select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        blocked: users.blocked,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.id, req.session.userId));

      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ authenticated: false });
      }

      // Sessão ativa mas usuário foi bloqueado → força logout e registra
      if (user.blocked) {
        req.session.destroy(() => {});
        writeAuditLog({
          req,
          action: "SESSION_EXPIRED_BLOCKED",
          actorId: user.id,
          actorUsername: user.username,
          details: "Sessão encerrada automaticamente — conta bloqueada",
          success: false,
        });
        return res.status(403).json({ authenticated: false, blocked: true });
      }

      res.json({ authenticated: true, user });
    } catch (err) {
      console.error("[AUTH ME]", err);
      res.status(500).json({ error: "Erro interno" });
    }
  });

  /* ---- REGISTER ---- */
  app.post("/api/auth/register", async (req, res) => {
    const { username, email, password } = req.body as {
      username?: string;
      email?: string;
      password?: string;
    };

    if (!username?.trim() || !email?.trim() || !password?.trim()) {
      return res.status(400).json({ error: "Preencha todos os campos" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres" });
    }

    try {
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username.trim().toLowerCase()));
      if (existing.length > 0) {
        return res.status(409).json({ error: "Usuário já cadastrado com este nome" });
      }

      const existingEmail = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.trim().toLowerCase()));
      if (existingEmail.length > 0) {
        return res.status(409).json({ error: "E-mail já cadastrado" });
      }

      const [{ total }] = await db.select({ total: count() }).from(users);
      const role = Number(total) === 0 ? "admin" : "user";
      const passwordHash = await bcrypt.hash(password, 12);

      const [newUser] = await db.insert(users).values({
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        passwordHash,
        role,
        blocked: false,
      }).returning({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
      });

      req.session.userId = newUser.id;
      req.session.username = newUser.username;
      req.session.role = newUser.role;

      writeAuditLog({
        req,
        action: "REGISTER",
        actorId: newUser.id,
        actorUsername: newUser.username,
        details: `Novo usuário cadastrado — papel: ${newUser.role}`,
      });

      console.log(`[AUTH] Novo usuário: ${newUser.username} (${newUser.role})`);
      res.status(201).json({ success: true, user: newUser });
    } catch (err) {
      console.error("[AUTH REGISTER]", err);
      res.status(500).json({ error: "Erro ao cadastrar usuário" });
    }
  });

  /* ---- LOGIN ---- */
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body as {
      username?: string;
      password?: string;
    };

    if (!username?.trim() || !password?.trim()) {
      return res.status(400).json({ error: "Preencha usuário e senha" });
    }

    const rawUsername = username.trim().toLowerCase();

    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, rawUsername));

      if (!user) {
        // Usuário não existe — log sem actorId
        writeAuditLog({
          req,
          action: "LOGIN_FAILED",
          actorUsername: rawUsername,
          details: "Usuário não encontrado",
          success: false,
        });
        return res.status(401).json({ error: "Usuário ou senha incorretos" });
      }

      // Conta bloqueada
      if (user.blocked) {
        writeAuditLog({
          req,
          action: "LOGIN_BLOCKED",
          actorId: user.id,
          actorUsername: user.username,
          details: "Tentativa de login com conta bloqueada",
          success: false,
        });
        console.warn(`[AUTH] Tentativa de login de usuário bloqueado: ${user.username}`);
        return res.status(403).json({
          error: "Sua conta está bloqueada. Entre em contato com o administrador.",
          blocked: true,
        });
      }

      // Senha errada
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        writeAuditLog({
          req,
          action: "LOGIN_FAILED",
          actorId: user.id,
          actorUsername: user.username,
          details: "Senha incorreta",
          success: false,
        });
        return res.status(401).json({ error: "Usuário ou senha incorretos" });
      }

      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;

      writeAuditLog({
        req,
        action: "LOGIN_SUCCESS",
        actorId: user.id,
        actorUsername: user.username,
        details: `Login bem-sucedido — papel: ${user.role}`,
      });

      console.log(`[AUTH] Login: ${user.username} (${user.role})`);
      res.json({
        success: true,
        user: { id: user.id, username: user.username, email: user.email, role: user.role },
      });
    } catch (err) {
      console.error("[AUTH LOGIN]", err);
      res.status(500).json({ error: "Erro interno" });
    }
  });

  /* ---- LOGOUT ---- */
  app.post("/api/auth/logout", async (req, res) => {
    const username = req.session.username ?? "desconhecido";
    const userId   = req.session.userId;

    writeAuditLog({
      req,
      action: "LOGOUT",
      actorId: userId,
      actorUsername: username,
      details: "Logout voluntário",
    });

    req.session.destroy(() => {});
    res.json({ success: true });
  });

  /* ---- ADMIN: cria usuário manualmente ---- */
  app.post("/api/auth/users", requireAdmin, async (req, res) => {
    const { username, email, password, role } = req.body as {
      username?: string;
      email?: string;
      password?: string;
      role?: string;
    };

    if (!username?.trim() || !email?.trim() || !password?.trim()) {
      return res.status(400).json({ error: "Preencha usuário, e-mail e senha" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres" });
    }

    const allowedRoles = ["user", "admin"];
    const finalRole = allowedRoles.includes(role ?? "") ? role! : "user";

    try {
      const existingUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username.trim().toLowerCase()));
      if (existingUser.length > 0) {
        return res.status(409).json({ error: "Já existe um usuário com esse nome" });
      }

      const existingEmail = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.trim().toLowerCase()));
      if (existingEmail.length > 0) {
        return res.status(409).json({ error: "Já existe um usuário com esse e-mail" });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const [newUser] = await db.insert(users).values({
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        passwordHash,
        role: finalRole,
        blocked: false,
      }).returning({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      });

      writeAuditLog({
        req,
        action: "USER_CREATED_BY_ADMIN",
        actorId: req.session.userId,
        actorUsername: req.session.username,
        targetId: newUser.id,
        targetUsername: newUser.username,
        details: `Admin criou usuário "${newUser.username}" com papel "${finalRole}"`,
      });

      console.log(`[AUTH] Usuário criado pelo admin: ${newUser.username} (${finalRole}) por ${req.session.username}`);
      res.status(201).json({ success: true, user: newUser });
    } catch (err) {
      console.error("[AUTH CREATE USER]", err);
      res.status(500).json({ error: "Erro ao criar usuário" });
    }
  });

  /* ---- ADMIN: lista usuários ---- */
  app.get("/api/auth/users", requireAdmin, async (req, res) => {
    try {
      const all = await db.select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        blocked: users.blocked,
        blockedAt: users.blockedAt,
        createdAt: users.createdAt,
      }).from(users).orderBy(users.createdAt);
      res.json(all);
    } catch (err) {
      console.error("[AUTH USERS]", err);
      res.status(500).json({ error: "Erro ao buscar usuários" });
    }
  });

  /* ---- ADMIN: redefine senha do usuário ---- */
  app.patch("/api/auth/users/:id/reset-password", requireAdmin, async (req, res) => {
    const targetId = req.params.id;
    const { password } = req.body as { password?: string };

    if (!password?.trim() || password.length < 6) {
      return res.status(400).json({ error: "Nova senha deve ter pelo menos 6 caracteres" });
    }

    if (targetId === req.session.userId) {
      return res.status(400).json({ error: "Use o perfil para alterar sua própria senha" });
    }

    try {
      const [target] = await db.select({ id: users.id, username: users.username, role: users.role })
        .from(users).where(eq(users.id, targetId));

      if (!target) return res.status(404).json({ error: "Usuário não encontrado" });
      if (target.role === "admin") return res.status(400).json({ error: "Não é possível redefinir senha de outro administrador" });

      const passwordHash = await bcrypt.hash(password, 12);
      await db.update(users).set({ passwordHash }).where(eq(users.id, targetId));

      writeAuditLog({
        req,
        action: "USER_PASSWORD_RESET",
        actorId: req.session.userId,
        actorUsername: req.session.username,
        targetId: target.id,
        targetUsername: target.username,
        details: `Admin redefiniu a senha do usuário "${target.username}"`,
      });

      console.log(`[AUTH] Senha redefinida: ${target.username} por ${req.session.username}`);
      res.json({ success: true, message: `Senha de "${target.username}" redefinida com sucesso` });
    } catch (err) {
      console.error("[AUTH RESET PASSWORD]", err);
      res.status(500).json({ error: "Erro ao redefinir senha" });
    }
  });

  /* ---- ADMIN: bloqueia usuário ---- */
  app.patch("/api/auth/users/:id/block", requireAdmin, async (req, res) => {
    const targetId = req.params.id;

    if (targetId === req.session.userId) {
      return res.status(400).json({ error: "Administrador não pode bloquear a si mesmo" });
    }

    try {
      const [target] = await db.select({ id: users.id, username: users.username, role: users.role, blocked: users.blocked })
        .from(users).where(eq(users.id, targetId));

      if (!target) return res.status(404).json({ error: "Usuário não encontrado" });
      if (target.role === "admin") return res.status(400).json({ error: "Não é possível bloquear outro administrador" });
      if (target.blocked) return res.status(400).json({ error: "Usuário já está bloqueado" });

      await db.update(users)
        .set({ blocked: true, blockedAt: new Date() })
        .where(eq(users.id, targetId));

      writeAuditLog({
        req,
        action: "USER_BLOCKED",
        actorId: req.session.userId,
        actorUsername: req.session.username,
        targetId: target.id,
        targetUsername: target.username,
        details: `Admin bloqueou o usuário "${target.username}"`,
      });

      console.log(`[AUTH] Usuário bloqueado: ${target.username} por ${req.session.username}`);
      res.json({ success: true, message: `Usuário "${target.username}" bloqueado` });
    } catch (err) {
      console.error("[AUTH BLOCK]", err);
      res.status(500).json({ error: "Erro ao bloquear usuário" });
    }
  });

  /* ---- ADMIN: desbloqueia usuário ---- */
  app.patch("/api/auth/users/:id/unblock", requireAdmin, async (req, res) => {
    const targetId = req.params.id;

    try {
      const [target] = await db.select({ id: users.id, username: users.username, blocked: users.blocked })
        .from(users).where(eq(users.id, targetId));

      if (!target) return res.status(404).json({ error: "Usuário não encontrado" });
      if (!target.blocked) return res.status(400).json({ error: "Usuário não está bloqueado" });

      await db.update(users)
        .set({ blocked: false, blockedAt: null })
        .where(eq(users.id, targetId));

      writeAuditLog({
        req,
        action: "USER_UNBLOCKED",
        actorId: req.session.userId,
        actorUsername: req.session.username,
        targetId: target.id,
        targetUsername: target.username,
        details: `Admin desbloqueou o usuário "${target.username}"`,
      });

      console.log(`[AUTH] Usuário desbloqueado: ${target.username} por ${req.session.username}`);
      res.json({ success: true, message: `Usuário "${target.username}" desbloqueado` });
    } catch (err) {
      console.error("[AUTH UNBLOCK]", err);
      res.status(500).json({ error: "Erro ao desbloquear usuário" });
    }
  });

  /* ---- ADMIN: remove usuário ---- */
  app.delete("/api/auth/users/:id", requireAdmin, async (req, res) => {
    const targetId = req.params.id;

    if (targetId === req.session.userId) {
      return res.status(400).json({ error: "Administrador não pode remover a si mesmo" });
    }

    try {
      const [target] = await db.select({ id: users.id, username: users.username, role: users.role })
        .from(users).where(eq(users.id, targetId));

      if (!target) return res.status(404).json({ error: "Usuário não encontrado" });
      if (target.role === "admin") return res.status(400).json({ error: "Não é possível remover outro administrador" });

      await db.delete(users).where(eq(users.id, targetId));

      writeAuditLog({
        req,
        action: "USER_DELETED",
        actorId: req.session.userId,
        actorUsername: req.session.username,
        targetId: target.id,
        targetUsername: target.username,
        details: `Admin removeu permanentemente o usuário "${target.username}"`,
      });

      console.log(`[AUTH] Usuário removido: ${target.username} por ${req.session.username}`);
      res.json({ success: true, message: `Usuário "${target.username}" removido` });
    } catch (err) {
      console.error("[AUTH DELETE]", err);
      res.status(500).json({ error: "Erro ao remover usuário" });
    }
  });
}
