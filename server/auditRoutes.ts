import { type Express } from "express";
import { db } from "./db";
import { auditLogs } from "@shared/schema";
import { desc, ilike, or, eq, sql, and, ne } from "drizzle-orm";
import { requireAuth } from "./auth";

function requireAdmin(req: any, res: any, next: any) {
  if (!req.session?.userId) return res.status(401).json({ error: "Não autenticado" });
  if (req.session.role !== "admin") return res.status(403).json({ error: "Acesso negado" });
  next();
}

export function registerAuditRoutes(app: Express) {

  /* GET /api/audit/logs?page=1&limit=20&search=&action=ALL */
  app.get("/api/audit/logs", requireAdmin, async (req, res) => {
    try {
      const page   = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10));
      const limit  = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
      const search = String(req.query.search ?? "").trim();
      const action = String(req.query.action ?? "ALL").trim();
      const offset = (page - 1) * limit;

      // Condições dinâmicas
      const conditions: any[] = [];

      if (action !== "ALL") {
        conditions.push(eq(auditLogs.action, action));
      }

      if (search) {
        conditions.push(
          or(
            ilike(auditLogs.actorUsername,  `%${search}%`),
            ilike(auditLogs.targetUsername, `%${search}%`),
            ilike(auditLogs.ip,             `%${search}%`),
            ilike(auditLogs.details,        `%${search}%`),
          )
        );
      }

      const where = conditions.length > 0
        ? (conditions.length === 1 ? conditions[0] : and(...conditions))
        : undefined;

      // Total
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(auditLogs)
        .$dynamic()
        .where(where as any);

      // Página
      const rows = await db
        .select()
        .from(auditLogs)
        .$dynamic()
        .where(where as any)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset);

      res.json({ logs: rows, total: Number(total), page, limit });
    } catch (err) {
      console.error("[AUDIT GET]", err);
      res.status(500).json({ error: "Erro ao buscar logs" });
    }
  });
}
