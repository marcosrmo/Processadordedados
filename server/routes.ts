import { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getAllFieldPatterns, getFieldDisplayName } from "./fileProcessor";
import { previewDedup, runDedup, type DedupeType } from "./dedup";
import multer from "multer";
import express from "express";
import { db } from "./db";
import { columnMappings, sheetMetadata, uploadedFiles, consolidatedRecords } from "@shared/schema";
import { progressBus } from "./progress";
import { sql, isNull, isNotNull } from "drizzle-orm";

// Todos os formatos suportados: Excel, CSV UTF-8 e TXT
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1000 * 1024 * 1024, // 1 GB por arquivo
    files: 2000,                   // até 2000 arquivos por envio
  },
});

/* ==========================================================================
   FILA DE PROCESSAMENTO SERIALIZADO — RENDER + SUPABASE
   ==========================================================================
   No Render + Supabase, processar múltiplos arquivos em paralelo esgota o
   pool de conexões (cada processFile faz SELECT * + múltiplos INSERTs).
   A fila garante que apenas UM arquivo seja processado por vez, enquanto os
   demais aguardam. Isso evita:
     • Pool exhaustion (todas as 5 conexões ocupadas ao mesmo tempo)
     • Race conditions no merge (dois arquivos veem a mesma base vazia)
     • Timeouts de statement no Supabase por sobrecarga
   O progresso de cada arquivo é rastreado individualmente via SSE.
========================================================================== */
type QueueTask = { fileId: string; name: string; fn: () => Promise<void> };
const processingQueue: QueueTask[] = [];
let queueRunning = false;

function enqueueFile(task: QueueTask) {
  processingQueue.push(task);
  const pos = processingQueue.length;
  console.log(`[QUEUE] Enfileirado "${task.name}" — posição ${pos}`);
  // Notifica o SSE do arquivo sobre sua posição na fila
  if (pos > 0 && queueRunning) {
    progressBus.publish({
      type:     "queued",
      fileId:   task.fileId,
      fileName: task.name,
      message:  `Aguardando na fila… (${pos} arquivo${pos > 1 ? "s" : ""} na frente)`,
      position: pos,
    });
  }
  if (!queueRunning) drainQueue();
}

const TASK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos por arquivo

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[TIMEOUT] "${label}" excedeu ${ms / 60000} minutos — pulando para o próximo`));
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

async function drainQueue() {
  if (queueRunning || processingQueue.length === 0) return;
  queueRunning = true;
  while (processingQueue.length > 0) {
    const task = processingQueue.shift()!;
    console.log(`[QUEUE] Iniciando "${task.name}" — ${processingQueue.length} na fila`);
    try {
      await withTimeout(task.fn(), TASK_TIMEOUT_MS, task.name);
    } catch (err: any) {
      console.error(`[QUEUE] Erro/timeout em "${task.name}": ${err?.message || err}`);
      try { await storage.updateFileStatus(task.fileId, "error"); } catch {}
    }
  }
  queueRunning = false;
  console.log("[QUEUE] Fila vazia — aguardando próximo envio");
}

export async function registerRoutes(app: Express): Promise<Server> {

  app.use(express.json({ limit: "500mb" }));

  /* =========================
     STATS — DADOS REAIS DO BANCO
  ========================= */

  app.get("/api/stats", async (_req, res) => {
    try {
      const { pool } = await import("./db");

      const fileResult = await pool.query(`
        SELECT
          COUNT(*)::int AS "totalFiles",
          COUNT(*) FILTER (WHERE status = 'completed')::int AS "filesProcessed",
          COALESCE(SUM(total_rows), 0)::int AS "totalRows",
          COALESCE(SUM(file_size), 0)::bigint AS "totalSizeBytes"
        FROM uploaded_files
      `);

      const recResult = await pool.query(`
        SELECT COUNT(*)::int AS "recordsConsolidated"
        FROM consolidated_records
        WHERE deleted_at IS NULL
      `);

      const deletedResult = await pool.query(`
        SELECT COUNT(*)::int AS "deletedRecords"
        FROM consolidated_records
        WHERE deleted_at IS NOT NULL
      `);

      const actResult = await pool.query(`
        SELECT
          date_trunc('day', created_at)::date::text AS date,
          COUNT(*)::int AS count,
          COALESCE(SUM(total_rows), 0)::int AS rows
        FROM uploaded_files
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY date_trunc('day', created_at)
        ORDER BY date_trunc('day', created_at)
      `);

      const fs = fileResult.rows[0];
      const totalSizeGB = (Number(fs.totalSizeBytes) / 1024 / 1024 / 1024).toFixed(3);

      res.json({
        stats: {
          filesProcessed: fs.filesProcessed,
          totalFiles: fs.totalFiles,
          recordsConsolidated: recResult.rows[0].recordsConsolidated,
          deletedRecords: deletedResult.rows[0].deletedRecords,
          totalRows: fs.totalRows,
          dataSizeGB: totalSizeGB,
        },
        recentActivity: actResult.rows,
      });
    } catch (err) {
      console.error("[STATS]", err);
      res.status(500).json({ error: "Falha ao carregar estatísticas" });
    }
  });

  /* =========================
     UPLOAD DE ARQUIVOS
     Suporta: XLSX, XLS, ODS, CSV UTF-8 (delimitado por vírgula), TXT
  ========================= */

  app.post("/api/files/upload", upload.single("file"), async (req, res) => {
    try {
      const file = req.file as Express.Multer.File;
      if (!file) {
        return res.status(400).json({ error: "Nenhum arquivo recebido" });
      }

      const sizeMB = (file.buffer.length / 1024 / 1024).toFixed(1);
      console.log(`[UPLOAD] ${file.originalname} (${sizeMB} MB) — iniciando processamento async`);

      const pendingFile = await storage.createPendingFile(file.originalname, file.buffer);

      res.status(202).json(pendingFile);

      // Enfileira em vez de disparar direto — garante processamento serializado
      // no Render + Supabase (evita pool exhaustion com múltiplos arquivos)
      const capturedBuffer = file.buffer;
      enqueueFile({
        fileId: pendingFile.id,
        name:   file.originalname,
        fn:     () => storage.processFile(pendingFile.id, file.originalname, capturedBuffer),
      });

    } catch (error) {
      console.error("Erro no upload:", error);
      res.status(500).json({ error: "Falha ao processar upload" });
    }
  });

  /* =========================
     SSE — PROGRESSO EM TEMPO REAL
  ========================= */

  app.get("/api/progress/:fileId", (req, res) => {
    const { fileId } = req.params;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();

    const send = (data: object) => {
      try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
    };

    const sendPing = () => {
      try { res.write(`: keepalive\n\n`); } catch {}
    };

    send({ type: "connected", fileId });

    const pingInterval = setInterval(sendPing, 25000);

    const handler = (event: any) => {
      send(event);
      if (event.type === "done" || event.type === "error") {
        cleanup();
      }
    };

    progressBus.subscribe(fileId, handler);

    const cleanup = () => {
      clearInterval(pingInterval);
      progressBus.unsubscribe(fileId, handler);
      try { res.end(); } catch {}
    };

    req.on("close", () => {
      clearInterval(pingInterval);
      progressBus.unsubscribe(fileId, handler);
    });
  });

  /* =========================
     FILES
  ========================= */

  app.get("/api/files", async (_req, res) => {
    const files = await storage.getAllFiles();
    res.json(files);
  });

  app.delete("/api/files/:id", async (req, res) => {
    await storage.deleteFile(req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/files", async (_req, res) => {
    await storage.deleteAllFiles();
    res.json([]);
  });

  /* =========================
     FIELDS / ANALYSIS
  ========================= */

  app.get("/api/fields", (_req, res) => {
    res.json(getAllFieldPatterns());
  });

  app.get("/api/analysis/mappings", async (_req, res) => {
    try {
      const mappings = await db
        .select({
          id: columnMappings.id,
          sheetId: columnMappings.sheetId,
          originalColumnName: columnMappings.originalColumnName,
          columnIndex: columnMappings.columnIndex,
          mappedFieldName: columnMappings.mappedFieldName,
          detectionMethod: columnMappings.detectionMethod,
          confidence: columnMappings.confidence,
          sampleValues: columnMappings.sampleValues,
        })
        .from(columnMappings)
        .orderBy(columnMappings.sheetId, columnMappings.columnIndex);

      const enriched = mappings.map((m) => ({
        ...m,
        displayName: m.mappedFieldName ? getFieldDisplayName(m.mappedFieldName) : null,
      }));

      res.json({ mappings: enriched });
    } catch (error) {
      console.error("Erro ao buscar mapeamentos:", error);
      res.status(500).json({ error: "Falha ao carregar mapeamentos" });
    }
  });

  /* =========================
     CONSOLIDATED — registros ativos
  ========================= */

  app.get("/api/consolidated", async (_req, res) => {
    const records = await storage.getAllConsolidated();
    res.json(records);
  });

  /* Soft-delete: move para lixeira */
  app.post("/api/consolidated/delete-exported", async (req, res) => {
    const { ids } = req.body as { ids: string[] };
    if (!ids || ids.length === 0) {
      return res.status(400).json({ error: "Nenhum ID recebido" });
    }
    const deleted = await storage.softDeleteConsolidatedByIds(ids);
    console.log(`[CONSOLIDATED] ${deleted} registros movidos para lixeira`);
    res.json({ success: true, deleted });
  });

  /* Hard-delete permanente (usado pela lixeira para apagar definitivamente) */
  app.post("/api/consolidated/hard-delete", async (req, res) => {
    const { ids } = req.body as { ids: string[] };
    if (!ids || ids.length === 0) {
      return res.status(400).json({ error: "Nenhum ID recebido" });
    }
    const deleted = await storage.hardDeleteConsolidatedByIds(ids);
    console.log(`[CONSOLIDATED] ${deleted} registros excluídos permanentemente`);
    res.json({ success: true, deleted });
  });

  /* =========================
     LIXEIRA — registros deletados (soft-delete)
  ========================= */

  app.get("/api/consolidated/deleted", async (_req, res) => {
    try {
      const { pool } = await import("./db");
      const result = await pool.query(`
        SELECT * FROM consolidated_records
        WHERE deleted_at IS NOT NULL
        ORDER BY updated_at DESC
      `);
      res.json(result.rows);
    } catch (err) {
      console.error("[DELETED]", err);
      res.status(500).json({ error: "Falha ao carregar lixeira" });
    }
  });

  /* Restaurar registros da lixeira */
  app.post("/api/consolidated/restore", async (req, res) => {
    const { ids } = req.body as { ids: string[] };
    if (!ids || ids.length === 0) {
      return res.status(400).json({ error: "Nenhum ID recebido" });
    }
    const restored = await storage.restoreConsolidatedByIds(ids);
    console.log(`[CONSOLIDATED] ${restored} registros restaurados`);
    res.json({ success: true, restored });
  });

  /* =========================
     DEDUPLICAÇÃO
  ========================= */

  const VALID_DEDUP_TYPES = ["phone", "phone9", "name", "cpf", "cnpj", "combined"] as const;

  app.get("/api/dedup-preview", async (req, res) => {
    const type = req.query.type as string;
    if (!VALID_DEDUP_TYPES.includes(type as any)) {
      return res.status(400).json({ error: "type inválido" });
    }
    try {
      const result = await previewDedup(type as DedupeType);
      res.json(result);
    } catch (err) {
      console.error("[DEDUP PREVIEW]", err);
      res.status(500).json({ error: "Erro ao analisar duplicatas" });
    }
  });

  app.post("/api/dedup-run", async (req, res) => {
    const { type } = req.body as { type: string };
    if (!VALID_DEDUP_TYPES.includes(type as any)) {
      return res.status(400).json({ error: "type inválido" });
    }
    try {
      const result = await runDedup(type as DedupeType);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("[DEDUP RUN]", err);
      res.status(500).json({ error: "Erro ao remover duplicatas" });
    }
  });

  return createServer(app);
}
