import { db } from "./db";
import { auditLogs } from "@shared/schema";
import type { Request } from "express";

export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGIN_BLOCKED"
  | "LOGOUT"
  | "REGISTER"
  | "USER_BLOCKED"
  | "USER_UNBLOCKED"
  | "USER_DELETED"
  | "SESSION_EXPIRED_BLOCKED";

interface LogParams {
  req:            Request;
  action:         AuditAction;
  actorId?:       string;
  actorUsername:  string;
  targetId?:      string;
  targetUsername?: string;
  details?:       string;
  success?:       boolean;
}

function getIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function getUA(req: Request): string {
  return (req.headers["user-agent"] ?? "unknown").slice(0, 255);
}

export async function writeAuditLog(params: LogParams): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorId:        params.actorId   ?? null,
      actorUsername:  params.actorUsername,
      action:         params.action,
      targetId:       params.targetId  ?? null,
      targetUsername: params.targetUsername ?? null,
      details:        params.details   ?? null,
      ip:             getIp(params.req),
      userAgent:      getUA(params.req),
      success:        params.success   ?? true,
    });
  } catch (err) {
    // Nunca deixar o log travar a operação principal
    console.error("[AUDIT] Falha ao gravar log:", err);
  }
}
