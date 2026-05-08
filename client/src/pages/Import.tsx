import { useState, useEffect, useRef, useCallback } from "react";
import type { UploadedFile } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileSpreadsheet, X, Trash2, CheckCircle2,
  AlertCircle, Loader2, FileText,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Formatos aceitos: Excel, CSV UTF-8 (delimitado por vírgula) e TXT
const ACCEPTED_FORMATS = ".xlsx,.xls,.xlsm,.xlsb,.xltx,.xltm,.xlam,.ods,.csv,.txt";

interface FileProgress {
  fileName: string;
  fileIndex: number;
  totalFiles: number;
  status: "waiting" | "uploading" | "processing" | "done" | "error";
  currentSheet?: string;
  sheetIndex?: number;
  totalSheets?: number;
  currentRow?: number;
  totalRows?: number;
  percent?: number;
  insertedTotal?: number;
  message?: string;
}

interface LogEntry {
  time: string;
  msg: string;
  type?: "info" | "success" | "error" | "progress" | "batch";
}

export default function Import() {
  const [files, setFiles]               = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive]     = useState(false);
  const [isRunning, setIsRunning]       = useState(false);
  const [fileProgress, setFileProgress] = useState<FileProgress | null>(null);
  const [logs, setLogs]                 = useState<LogEntry[]>([]);
  const [liveStatus, setLiveStatus]     = useState<string>("");
  const [overallProgress, setOverallProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef   = useRef<HTMLDivElement>(null);
  const { toast }    = useToast();

  useEffect(() => {
    fetchFiles();
    const interval = setInterval(fetchFiles, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const fetchFiles = async () => {
    try {
      const r = await fetch("/api/files");
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data)) setFiles(data);
      }
    } catch {}
  };

  const addLog = useCallback((msg: string, type: LogEntry["type"] = "info") => {
    const time = new Date().toLocaleTimeString("pt-BR", { hour12: false });
    setLogs((prev) => [...prev.slice(-500), { time, msg, type }]);
  }, []);

  /* =====================================================================
     NÚCLEO: conecta SSE para um fileId e aguarda evento done/error
  ===================================================================== */
  const waitForSSE = (
    fileId: string,
    fileName: string,
    fileIndex: number,
    totalFiles: number,
  ): Promise<number> => {
    return new Promise((resolve) => {
      let resolved = false;
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let processingStart: number | null = null;

      const done = (inserted: number) => {
        if (resolved) return;
        resolved = true;
        if (pollTimer) clearInterval(pollTimer);
        evtSource.close();
        resolve(inserted);
      };

      const startPolling = () => {
        if (pollTimer) return;
        addLog(`  ⚠ SSE desconectado — aguardando processamento via polling…`, "info");
        pollTimer = setInterval(async () => {
          try {
            const r = await fetch("/api/files");
            if (!r.ok) return;
            const files: any[] = await r.json();
            const f = files.find((x: any) => x.id === fileId);
            if (!f) return;
            if (f.status === "completed") {
              addLog(`[${fileIndex}/${totalFiles}] ✓ ${fileName}: concluído (${f.totalRows ?? "?"} registros)`, "success");
              done(f.totalRows ?? 0);
            } else if (f.status === "error") {
              addLog(`[${fileIndex}/${totalFiles}] ✗ ERRO no servidor ao processar ${fileName}`, "error");
              done(0);
            }
          } catch {}
        }, 4000);
      };

      const evtSource = new EventSource(`/api/progress/${fileId}`);

      evtSource.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (ev.type === "connected") return;

          setFileProgress((prev) =>
            prev
              ? {
                  ...prev,
                  status:
                    ev.type === "done"
                      ? "done"
                      : ev.type === "error"
                      ? "error"
                      : "processing",
                  currentSheet:  ev.currentSheet  ?? prev.currentSheet,
                  sheetIndex:    ev.sheetIndex    ?? prev.sheetIndex,
                  totalSheets:   ev.totalSheets   ?? prev.totalSheets,
                  currentRow:    ev.currentRow    ?? prev.currentRow,
                  totalRows:     ev.totalRows     ?? prev.totalRows,
                  percent:       ev.percent       ?? prev.percent,
                  insertedTotal: ev.insertedTotal ?? prev.insertedTotal,
                  message:       ev.message,
                }
              : null
          );

          if (ev.type === "row" || ev.type === "batch" || ev.type === "sheet" || ev.type === "start") {
            const currentRow = Number(ev.currentRow) || 0;
            if (currentRow > 0 && processingStart === null) {
              processingStart = Date.now();
            }
            const sheet  = ev.currentSheet  ? `📄 ${ev.currentSheet}` : "";
            const row    = currentRow        ? ` • linha ${currentRow.toLocaleString("pt-BR")}` : "";
            const total  = ev.totalRows     ? `/${Number(ev.totalRows).toLocaleString("pt-BR")}` : "";
            const pct    = ev.percent       ? ` (${ev.percent}%)` : "";
            const saved  = ev.insertedTotal ? ` • 💾 ${Number(ev.insertedTotal).toLocaleString("pt-BR")} no banco` : "";
            let speed = "";
            if (processingStart !== null && currentRow > 0) {
              const elapsed = (Date.now() - processingStart) / 1000;
              if (elapsed > 0.5) {
                const lps = Math.round(currentRow / elapsed);
                speed = ` • ⚡ ${lps.toLocaleString("pt-BR")} linhas/s`;
              }
            }
            setLiveStatus((sheet + row + total + pct + saved + speed) || ev.message || "");
          } else if (ev.type === "done") {
            addLog(
              `[${fileIndex}/${totalFiles}] ✓ ${fileName}: ${ev.insertedTotal ?? "?"} registros no banco`,
              "success",
            );
            done(ev.insertedTotal ?? 0);
          } else if (ev.type === "error") {
            addLog(`[${fileIndex}/${totalFiles}] ✗ ERRO: ${ev.message}`, "error");
            done(0);
          }
        } catch {}
      };

      evtSource.onerror = () => {
        evtSource.close();
        startPolling();
      };
    });
  };

  /* =====================================================================
     UPLOAD SEQUENCIAL COM SSE REAL
     Planilhas são processadas UMA APÓS A OUTRA na ordem enviada.
  ===================================================================== */
  const uploadFilesWithSSE = async (selected: File[]) => {
    if (!selected.length) return;
    setIsRunning(true);
    setLogs([]);
    setLiveStatus("");
    setOverallProgress(0);

    const total = selected.length;
    addLog(`▶ Iniciando: ${total} arquivo(s)`, "info");

    for (let i = 0; i < selected.length; i++) {
      const file = selected[i];

      setFileProgress({
        fileName: file.name,
        fileIndex: i + 1,
        totalFiles: total,
        status: "uploading",
        percent: 0,
        message: "Enviando para o servidor…",
      });
      setOverallProgress(Math.round((i / total) * 100));
      addLog(
        `[${i + 1}/${total}] → ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
        "info",
      );

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/files/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error((await res.text()) || "Falha no servidor");

        const saved = await res.json() as UploadedFile;

        setFileProgress((prev) =>
          prev ? { ...prev, status: "processing", message: "Processando linhas…" } : null
        );

        const inserted = await waitForSSE(saved.id, file.name, i + 1, total);

        setFileProgress((prev) =>
          prev
            ? {
                ...prev,
                status: "done",
                percent: 100,
                message: `✓ ${inserted.toLocaleString()} registros no banco`,
                insertedTotal: inserted,
              }
            : null
        );
        setOverallProgress(Math.round(((i + 1) / total) * 100));

      } catch (err: any) {
        addLog(`[${i + 1}/${total}] ✗ ${file.name}: ${err.message}`, "error");
        setFileProgress((prev) =>
          prev ? { ...prev, status: "error", message: err.message } : null
        );
        toast({
          variant: "destructive",
          title: `Erro: ${file.name}`,
          description: err.message,
        });
      }
    }

    setOverallProgress(100);
    setIsRunning(false);
    addLog(`✓ Todos os ${total} arquivo(s) finalizados!`, "success");
    toast({
      title: "Importação concluída!",
      description: `${total} arquivo(s) processados — dados disponíveis em Consolidação e Export.`,
    });
    fetchFiles();
    setTimeout(() => { setFileProgress(null); setOverallProgress(0); }, 6000);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) uploadFilesWithSSE(Array.from(e.dataTransfer.files));
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      uploadFilesWithSSE(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const removeFile = async (id: string) => {
    await fetch(`/api/files/${id}`, { method: "DELETE" });
    toast({ title: "Arquivo removido" });
    fetchFiles();
  };

  const clearAll = async () => {
    if (!confirm("Apagar TODOS os dados do banco?")) return;
    await fetch("/api/files", { method: "DELETE" });
    toast({ title: "Banco limpo" });
    addLog("Banco de dados limpo pelo usuário", "info");
    fetchFiles();
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed":  return <Badge className="bg-green-600 text-white text-[10px]">Completo</Badge>;
      case "processing": return <Badge className="bg-yellow-500 animate-pulse text-white text-[10px]">Processando</Badge>;
      case "error":      return <Badge className="bg-red-600 text-white text-[10px]">Erro</Badge>;
      default:           return <Badge variant="outline" className="text-[10px]">Enviando</Badge>;
    }
  };

  const logColor = (type?: LogEntry["type"]) => {
    switch (type) {
      case "success":  return "text-green-400";
      case "error":    return "text-red-400";
      case "progress": return "text-blue-300";
      case "batch":    return "text-emerald-400 font-semibold";
      default:         return "text-zinc-300";
    }
  };

  const fileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "txt") return <FileText className="text-amber-500 shrink-0" size={16} />;
    if (ext === "csv") return <FileText className="text-green-500 shrink-0" size={16} />;
    return <FileSpreadsheet className="text-blue-500 shrink-0" size={16} />;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto w-full flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Importar Arquivos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Processamento em tempo real — planilhas processadas em ordem, dados salvos direto no banco a cada 1.000 linhas.
          Já aparecem em Consolidação e Export durante o upload.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ===== COLUNA ESQUERDA ===== */}
        <div className="lg:col-span-2 space-y-4">
          {/* Drop Zone */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInput}
            accept={ACCEPTED_FORMATS}
          />
          <Card
            className={`border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200 ${
              dragActive
                ? "border-primary bg-primary/10 scale-[1.01]"
                : isRunning
                ? "border-yellow-500/50 bg-yellow-500/5 cursor-not-allowed"
                : "border-muted hover:border-primary/50 hover:bg-muted/30"
            }`}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={!isRunning ? handleDrop : undefined}
            onClick={!isRunning ? () => fileInputRef.current?.click() : undefined}
          >
            {isRunning ? (
              <Loader2 className="mx-auto mb-3 text-yellow-500 animate-spin" size={36} />
            ) : (
              <Upload className="mx-auto mb-3 text-primary" size={36} />
            )}
            <h3 className="font-semibold text-base">
              {isRunning
                ? "Processando — dados gravando no banco em tempo real…"
                : "Clique ou arraste suas planilhas aqui"}
            </h3>
            <p className="text-xs text-muted-foreground mt-2">
              XLSX • XLS • XLSM • XLSB • ODS • CSV UTF-8 • TXT — até 1 GB por arquivo • 2.000 arquivos
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 opacity-70">
              CSV: delimitado por vírgula, ponto-e-vírgula, pipe ou TAB • TXT: mesmo tratamento que CSV
            </p>
          </Card>

          {/* Progresso do arquivo atual */}
          <AnimatePresence>
            {fileProgress && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {fileProgress.status === "done" ? (
                          <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                        ) : fileProgress.status === "error" ? (
                          <AlertCircle size={18} className="text-red-500 shrink-0" />
                        ) : (
                          <Loader2 size={18} className="text-primary animate-spin shrink-0" />
                        )}
                        <span className="font-medium text-sm truncate">{fileProgress.fileName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        Arquivo {fileProgress.fileIndex}/{fileProgress.totalFiles}
                      </span>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                        <span>Progresso geral ({fileProgress.totalFiles} arquivo{fileProgress.totalFiles > 1 ? "s" : ""})</span>
                        <span>{overallProgress}%</span>
                      </div>
                      <Progress value={overallProgress} className="h-2" />
                    </div>

                    {fileProgress.currentSheet && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-muted/50 rounded px-2 py-1">
                          <span className="text-muted-foreground">Aba: </span>
                          <span className="font-medium">{fileProgress.currentSheet}</span>
                          {fileProgress.totalSheets && fileProgress.totalSheets > 1 && (
                            <span className="text-muted-foreground ml-1">
                              ({(fileProgress.sheetIndex ?? 0) + 1}/{fileProgress.totalSheets})
                            </span>
                          )}
                        </div>
                        {fileProgress.currentRow !== undefined && (
                          <div className="bg-muted/50 rounded px-2 py-1">
                            <span className="text-muted-foreground">Linha: </span>
                            <span className="font-medium">
                              {fileProgress.currentRow.toLocaleString()}
                            </span>
                            {fileProgress.totalRows && (
                              <span className="text-muted-foreground">
                                /{fileProgress.totalRows.toLocaleString()}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {fileProgress.percent !== undefined && (
                      <div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                          <span>Arquivo atual</span>
                          <span>{fileProgress.percent}%</span>
                        </div>
                        <Progress value={fileProgress.percent} className="h-1.5" />
                      </div>
                    )}

                    {fileProgress.message && (
                      <p className="text-[11px] text-muted-foreground">{fileProgress.message}</p>
                    )}

                    {fileProgress.insertedTotal !== undefined && fileProgress.insertedTotal > 0 && (
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        💾 {fileProgress.insertedTotal.toLocaleString()} registros no banco
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Lista de arquivos */}
          <Card>
            <CardHeader className="flex flex-row justify-between items-center py-3 px-4">
              <CardTitle className="text-sm font-semibold">
                Arquivos Processados ({files.length})
              </CardTitle>
              {files.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  className="text-destructive h-7 text-xs"
                  disabled={isRunning}
                >
                  <Trash2 size={12} className="mr-1" /> Limpar Banco
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[280px] px-4">
                {files.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-24 text-muted-foreground">
                    <FileText size={24} className="mb-2 opacity-30" />
                    <p className="text-xs">Nenhum arquivo importado ainda</p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {files.map((file) => (
                      <motion.div
                        key={file.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="flex justify-between items-center py-2.5 px-1 border-b last:border-0"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {fileIcon(file.originalName)}
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{file.originalName}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {(file.fileSize / 1024).toFixed(0)} KB
                              {file.totalRows ? ` • ${file.totalRows.toLocaleString()} registros` : ""}
                              {file.totalSheets ? ` • ${file.totalSheets} aba(s)` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {statusBadge(file.status)}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeFile(file.id)}
                            disabled={isRunning}
                          >
                            <X size={12} />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
                <div ref={logsEndRef} />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* ===== TERMINAL ===== */}
        <Card className="bg-zinc-950 text-zinc-300 border-zinc-800 flex flex-col h-fit">
          <CardHeader className="border-b border-zinc-800 py-2 px-4 shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                Terminal — Gravação em Tempo Real
              </CardTitle>
              <div className={`w-2 h-2 rounded-full ${isRunning ? "bg-green-500 animate-pulse" : "bg-zinc-700"}`} />
            </div>
          </CardHeader>

          <CardContent className="p-0 overflow-hidden">
            <ScrollArea className="h-[180px] p-3 font-mono text-[10px]">
              {logs.length === 0 ? (
                <p className="text-zinc-600 mt-2">Aguardando upload…</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`mb-0.5 leading-relaxed ${logColor(log.type)}`}>
                    <span className="text-zinc-600 mr-1">[{log.time}]</span>
                    {log.msg}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </ScrollArea>

            {/* Linha única de status da planilha atual */}
            {isRunning && (
              <div className="border-t border-zinc-800 px-3 py-2 font-mono text-[10px] text-yellow-300 flex items-center gap-2 min-h-[30px]">
                <span className="animate-pulse shrink-0">↻</span>
                <span className="truncate">{liveStatus || "aguardando evento…"}</span>
              </div>
            )}
          </CardContent>

          <div className="p-3 border-t border-zinc-800 space-y-1 shrink-0">
            <div className="flex justify-between text-[9px] text-zinc-500 font-mono uppercase">
              <span>Progresso Geral</span>
              <span>{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-1 bg-zinc-800" />
            <div className="flex justify-between text-[9px] text-zinc-600 font-mono mt-1">
              <span>Status: {isRunning ? "GRAVANDO" : "IDLE"}</span>
              <span>{files.length} arquivo(s) no banco</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
