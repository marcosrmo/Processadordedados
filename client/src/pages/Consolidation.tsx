import { useState, useEffect, useMemo, useCallback } from "react";
import { useDragScroll } from "@/hooks/useDragScroll";
import type { ConsolidatedRecord } from "@shared/schema";
import { useConsolidatedData } from "@/contexts/ConsolidatedDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Trash2, RefreshCw, RotateCcw, Trash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Consolidation() {
  const { records, setRecords, loading, fetchRecords } = useConsolidatedData();
  const [deleted, setDeleted]         = useState<ConsolidatedRecord[]>([]);
  const [search, setSearch]           = useState("");
  const [searchDeleted, setSearchDeleted] = useState("");
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoringAll, setRestoringAll] = useState(false);
  const [purgingAll, setPurgingAll]   = useState(false);
  const [activeTab, setActiveTab]     = useState("active");
  const { toast } = useToast();
  const dragScroll = useDragScroll();
  const dragScrollDeleted = useDragScroll();

  const fetchDeleted = useCallback(() => {
    setLoadingDeleted(true);
    fetch("/api/consolidated/deleted")
      .then((res) => res.json())
      .then((data) => {
        setDeleted(data || []);
        setLoadingDeleted(false);
      })
      .catch(() => setLoadingDeleted(false));
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  useEffect(() => {
    if (activeTab === "trash") fetchDeleted();
  }, [activeTab, fetchDeleted]);

  const filteredRecords = useMemo(() => {
    if (!search) return records;
    const q = search.toLowerCase();
    return records.filter((r) =>
      JSON.stringify(Object.values(r)).toLowerCase().includes(q)
    );
  }, [records, search]);

  const filteredDeleted = useMemo(() => {
    if (!searchDeleted) return deleted;
    const q = searchDeleted.toLowerCase();
    return deleted.filter((r) =>
      JSON.stringify(Object.values(r)).toLowerCase().includes(q)
    );
  }, [deleted, searchDeleted]);

  /* ===== SOFT DELETE (mover para lixeira) ===== */
  const deleteOne = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch("/api/consolidated/delete-exported", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) throw new Error();
      setRecords((prev) => prev.filter((r) => r.id !== id));
      toast({ title: "Registro movido para a lixeira" });
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Falha ao excluir registro." });
    } finally {
      setDeletingId(null);
    }
  };

  const deleteAll = async () => {
    if (!confirm(`Mover todos os ${records.length} registros para a lixeira?`)) return;
    setDeletingAll(true);
    try {
      const ids = records.map((r) => r.id);
      const res = await fetch("/api/consolidated/delete-exported", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
      setRecords([]);
      toast({ title: "Todos os registros movidos para a lixeira" });
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Falha ao mover registros." });
    } finally {
      setDeletingAll(false);
    }
  };

  /* ===== RESTAURAR ===== */
  const restoreOne = async (id: string) => {
    setRestoringId(id);
    try {
      const res = await fetch("/api/consolidated/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) throw new Error();
      setDeleted((prev) => prev.filter((r) => r.id !== id));
      toast({ title: "Registro restaurado com sucesso" });
      fetchRecords();
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Falha ao restaurar registro." });
    } finally {
      setRestoringId(null);
    }
  };

  const restoreAll = async () => {
    if (!confirm(`Restaurar todos os ${deleted.length} registros da lixeira?`)) return;
    setRestoringAll(true);
    try {
      const ids = deleted.map((r) => r.id);
      const res = await fetch("/api/consolidated/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
      setDeleted([]);
      toast({ title: "Todos os registros restaurados" });
      fetchRecords();
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Falha ao restaurar registros." });
    } finally {
      setRestoringAll(false);
    }
  };

  /* ===== HARD DELETE (apagar permanentemente da lixeira) ===== */
  const purgeOne = async (id: string) => {
    if (!confirm("Apagar permanentemente este registro? Ação irreversível.")) return;
    try {
      const res = await fetch("/api/consolidated/hard-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) throw new Error();
      setDeleted((prev) => prev.filter((r) => r.id !== id));
      toast({ title: "Registro excluído permanentemente" });
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Falha ao excluir." });
    }
  };

  const purgeAll = async () => {
    if (!confirm(`Apagar permanentemente todos os ${deleted.length} registros da lixeira? Ação irreversível.`)) return;
    setPurgingAll(true);
    try {
      const ids = deleted.map((r) => r.id);
      const res = await fetch("/api/consolidated/hard-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
      setDeleted([]);
      toast({ title: "Lixeira esvaziada" });
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Falha ao esvaziar lixeira." });
    } finally {
      setPurgingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <RefreshCw className="animate-spin mr-2" size={20} />
        <span>Carregando dados consolidados...</span>
      </div>
    );
  }

  /* ===== TABELA DE REGISTROS ===== */
  const RecordTable = ({
    rows,
    scroll,
    showRestore = false,
    onDelete,
    onRestore,
    onPurge,
    deletingId: delId,
    restoringId: restId,
  }: {
    rows: ConsolidatedRecord[];
    scroll: ReturnType<typeof useDragScroll>;
    showRestore?: boolean;
    onDelete?: (id: string) => void;
    onRestore?: (id: string) => void;
    onPurge?: (id: string) => void;
    deletingId?: string | null;
    restoringId?: string | null;
  }) => (
    <div
      ref={scroll.ref}
      className="overflow-auto"
      style={{ fontSize: "11px", cursor: "grab", userSelect: "none" }}
      onMouseDown={scroll.onMouseDown}
      onMouseLeave={scroll.onMouseLeave}
      onMouseUp={scroll.onMouseUp}
      onMouseMove={scroll.onMouseMove}
    >
      <Table>
        <TableHeader className="sticky top-0 bg-muted/80 z-10">
          <TableRow>
            <TableHead className="py-1.5 px-2 whitespace-nowrap">Telefone</TableHead>
            <TableHead className="py-1.5 px-2 whitespace-nowrap">Nome</TableHead>
            <TableHead className="py-1.5 px-2 whitespace-nowrap">CPF/CNPJ</TableHead>
            <TableHead className="py-1.5 px-2 whitespace-nowrap">Email</TableHead>
            <TableHead className="py-1.5 px-2 whitespace-nowrap">Cidade</TableHead>
            <TableHead className="py-1.5 px-2 whitespace-nowrap">Logradouro</TableHead>
            <TableHead className="py-1.5 px-2 whitespace-nowrap">Nº</TableHead>
            <TableHead className="py-1.5 px-2 whitespace-nowrap">Complemento</TableHead>
            <TableHead className="py-1.5 px-2 whitespace-nowrap">Bairro</TableHead>
            <TableHead className="py-1.5 px-2 whitespace-nowrap">UF</TableHead>
            <TableHead className="py-1.5 px-2 whitespace-nowrap">CEP</TableHead>
            <TableHead className="py-1.5 px-2 whitespace-nowrap">Dt. Últ. Compra</TableHead>
            <TableHead className="py-1.5 px-2 whitespace-nowrap">Produto</TableHead>
            <TableHead className="py-1.5 px-2 whitespace-nowrap">Qtd</TableHead>
            <TableHead className="py-1.5 px-2 whitespace-nowrap">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((record) => (
            <TableRow key={record.id} className="hover:bg-muted/30">
              <TableCell className="py-1 px-2 whitespace-nowrap">{record.phone || "—"}</TableCell>
              <TableCell className="py-1 px-2 font-medium whitespace-nowrap max-w-[140px] truncate">{record.name || "—"}</TableCell>
              <TableCell className="py-1 px-2 font-mono whitespace-nowrap">{record.cpf || record.cnpj || "—"}</TableCell>
              <TableCell className="py-1 px-2 whitespace-nowrap max-w-[140px] truncate">{(record as any).email || "—"}</TableCell>
              <TableCell className="py-1 px-2 whitespace-nowrap">{record.city || "—"}</TableCell>
              <TableCell className="py-1 px-2 whitespace-nowrap max-w-[160px] truncate">{record.address || "—"}</TableCell>
              <TableCell className="py-1 px-2 whitespace-nowrap">{record.number || "—"}</TableCell>
              <TableCell className="py-1 px-2 whitespace-nowrap max-w-[100px] truncate">{record.complement || "—"}</TableCell>
              <TableCell className="py-1 px-2 whitespace-nowrap">{record.neighborhood || "—"}</TableCell>
              <TableCell className="py-1 px-2 whitespace-nowrap">
                {record.state ? (
                  <Badge variant="outline" className="text-[10px] py-0 px-1">{record.state}</Badge>
                ) : "—"}
              </TableCell>
              <TableCell className="py-1 px-2 font-mono whitespace-nowrap">{record.cep || "—"}</TableCell>
              <TableCell className="py-1 px-2 whitespace-nowrap">{record.purchaseDate || "—"}</TableCell>
              <TableCell className="py-1 px-2 whitespace-nowrap max-w-[120px] truncate">{(record as any).produto || "—"}</TableCell>
              <TableCell className="py-1 px-2 whitespace-nowrap">{(record as any).quantidade || "—"}</TableCell>
              <TableCell className="py-1 px-2">
                <div className="flex items-center gap-1">
                  {showRestore && onRestore && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-green-600 hover:text-green-700"
                      disabled={restId === record.id}
                      onClick={() => onRestore(record.id)}
                      title="Restaurar"
                    >
                      <RotateCcw size={12} />
                    </Button>
                  )}
                  {showRestore && onPurge && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => onPurge(record.id)}
                      title="Apagar permanentemente"
                    >
                      <Trash size={12} />
                    </Button>
                  )}
                  {!showRestore && onDelete && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      disabled={delId === record.id}
                      onClick={() => onDelete(record.id)}
                      title="Mover para lixeira"
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="p-4 h-full flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Consolidação de Dados</h1>
          <p className="text-xs text-muted-foreground">{records.length} registros ativos • {deleted.length} na lixeira</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-fit">
          <TabsTrigger value="active">
            Registros Ativos
            <Badge variant="secondary" className="ml-1.5 text-[10px]">{records.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="trash">
            Lixeira
            {deleted.length > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-[10px]">{deleted.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ===== ABA ATIVOS ===== */}
        <TabsContent value="active" className="flex-1 flex flex-col min-h-0 mt-3">
          <div className="flex gap-2 flex-wrap mb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                className="pl-8 h-8 text-xs w-48"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={fetchRecords}>
              <RefreshCw size={13} className="mr-1" /> Atualizar
            </Button>
            {records.length > 0 && (
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                onClick={deleteAll}
                disabled={deletingAll}
              >
                <Trash2 size={13} className="mr-1" />
                {deletingAll ? "Movendo..." : "Mover Tudo p/ Lixeira"}
              </Button>
            )}
          </div>

          <Card className="flex-1 min-h-0 overflow-hidden">
            <CardHeader className="py-2 px-4 border-b">
              <CardTitle className="text-sm">
                Mostrando {Math.min(filteredRecords.length, 50)} de {records.length} registros
                {filteredRecords.length > 50 && (
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">(prévia — primeiros 50)</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-full overflow-auto">
              {filteredRecords.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                  {records.length === 0
                    ? "Nenhum dado consolidado. Importe planilhas para começar."
                    : "Nenhum resultado encontrado."}
                </div>
              ) : (
                <RecordTable
                  rows={filteredRecords.slice(0, 50)}
                  scroll={dragScroll}
                  onDelete={deleteOne}
                  deletingId={deletingId}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== ABA LIXEIRA ===== */}
        <TabsContent value="trash" className="flex-1 flex flex-col min-h-0 mt-3">
          <div className="flex gap-2 flex-wrap mb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar na lixeira..."
                className="pl-8 h-8 text-xs w-48"
                value={searchDeleted}
                onChange={(e) => setSearchDeleted(e.target.value)}
              />
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={fetchDeleted}>
              <RefreshCw size={13} className="mr-1" /> Atualizar
            </Button>
            {deleted.length > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs text-green-700 border-green-300 hover:bg-green-50"
                  onClick={restoreAll}
                  disabled={restoringAll}
                >
                  <RotateCcw size={13} className="mr-1" />
                  {restoringAll ? "Restaurando..." : "Restaurar Tudo"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 text-xs"
                  onClick={purgeAll}
                  disabled={purgingAll}
                >
                  <Trash size={13} className="mr-1" />
                  {purgingAll ? "Apagando..." : "Esvaziar Lixeira"}
                </Button>
              </>
            )}
          </div>

          <Card className="flex-1 min-h-0 overflow-hidden">
            <CardHeader className="py-2 px-4 border-b">
              <CardTitle className="text-sm text-muted-foreground">
                {loadingDeleted
                  ? "Carregando..."
                  : `${Math.min(filteredDeleted.length, 50)} de ${filteredDeleted.length} registros na lixeira`}
                {filteredDeleted.length > 50 && (
                  <span className="ml-2 text-[11px] font-normal">(prévia — primeiros 50)</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-full overflow-auto">
              {loadingDeleted ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                  <RefreshCw className="animate-spin mr-2" size={16} />
                  Carregando lixeira...
                </div>
              ) : filteredDeleted.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                  Lixeira vazia.
                </div>
              ) : (
                <RecordTable
                  rows={filteredDeleted.slice(0, 50)}
                  scroll={dragScrollDeleted}
                  showRestore={true}
                  onRestore={restoreOne}
                  onPurge={purgeOne}
                  restoringId={restoringId}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
