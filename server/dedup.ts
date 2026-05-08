import { db } from "./db";
import { consolidatedRecords } from "@shared/schema";
import { inArray } from "drizzle-orm";

/* ===========================
   HELPERS
=========================== */

const normalizeName = (v: string) =>
  v.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

const normalizePhone = (v: string) => (v || "").replace(/\D/g, "");

/** Normaliza telefone brasileiro para 11 dígitos (com 9 dígito celular) */
const normalizeBrPhone = (digits: string): string => {
  if (!digits) return "";
  // Remove 0 inicial se existir (ex: 011999...)
  if (digits.length === 12 && digits.startsWith("0")) digits = digits.slice(1);
  // 10 dígitos: DDD + 8 dígitos → provavelmente falta o 9
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const local = digits.slice(2);
    // Adiciona 9 se o número começa com 6,7,8,9 (celular)
    if ("6789".includes(local[0])) return ddd + "9" + local;
  }
  return digits;
};

const filledCount = (obj: any) =>
  Object.values(obj).filter((v) => v !== null && v !== "" && v !== undefined).length;

const normalizeId = (v: string) => (v || "").replace(/\D/g, "");

/* ===========================
   TIPOS DE DEDUPLICAÇÃO
=========================== */

export type DedupeType = "phone" | "phone9" | "name" | "cpf" | "cnpj" | "combined";

export interface DedupeResult {
  duplicateGroups: number;
  toRemove: number;
  toKeep: number;
}

function buildToDelete(all: any[], type: DedupeType): { toDelete: string[]; groups: number } {
  const buckets = new Map<string, any[]>();

  for (const record of all) {
    let key: string;

    switch (type) {
      case "phone": {
        const d = normalizePhone(record.phone || "");
        if (!d) continue;
        key = d;
        break;
      }
      case "phone9": {
        const d = normalizePhone(record.phone || "");
        if (!d) continue;
        key = normalizeBrPhone(d);
        break;
      }
      case "name": {
        const n = normalizeName(record.name || "");
        if (!n) continue;
        key = n;
        break;
      }
      case "cpf": {
        const c = normalizeId(record.cpf || "");
        // CPF tem 11 dígitos
        if (!c || c.length !== 11) continue;
        key = c;
        break;
      }
      case "cnpj": {
        const c = normalizeId(record.cpf || "");
        // CNPJ tem 14 dígitos
        if (!c || c.length !== 14) continue;
        key = c;
        break;
      }
      case "combined": {
        // Combina telefone normalizado + nome normalizado
        const d = normalizeBrPhone(normalizePhone(record.phone || ""));
        const n = normalizeName(record.name || "");
        if (!d && !n) continue;
        key = `${d}||${n}`;
        break;
      }
      default:
        continue;
    }

    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(record);
  }

  const toDelete: string[] = [];
  let groups = 0;

  for (const group of buckets.values()) {
    if (group.length <= 1) continue;
    groups++;
    // Mantém o registro com mais campos preenchidos
    group.sort((a: any, b: any) => filledCount(b) - filledCount(a));
    for (let i = 1; i < group.length; i++) {
      toDelete.push(group[i].id);
    }
  }

  return { toDelete, groups };
}

export async function previewDedup(type: DedupeType): Promise<DedupeResult> {
  const all = await db.select().from(consolidatedRecords);
  const { toDelete, groups } = buildToDelete(all, type);
  return {
    duplicateGroups: groups,
    toRemove: toDelete.length,
    toKeep: all.length - toDelete.length,
  };
}

export async function runDedup(type: DedupeType): Promise<{ removed: number; kept: number }> {
  const all = await db.select().from(consolidatedRecords);
  const { toDelete } = buildToDelete(all, type);

  if (toDelete.length > 0) {
    // Chunked para evitar limite de parâmetros do PostgreSQL
    const CHUNK = 500;
    for (let i = 0; i < toDelete.length; i += CHUNK) {
      await db
        .delete(consolidatedRecords)
        .where(inArray(consolidatedRecords.id, toDelete.slice(i, i + CHUNK)));
    }
  }

  return { removed: toDelete.length, kept: all.length - toDelete.length };
}
