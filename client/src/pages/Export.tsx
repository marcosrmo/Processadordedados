import { useMemo, useState } from "react";
import type { ConsolidatedRecord } from "@shared/schema";
import { useConsolidatedData } from "@/contexts/ConsolidatedDataContext";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Download,
  Trash2,
  RefreshCw,
  FileSpreadsheet,
  Filter,
  ScanSearch,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ===========================
   COLUNAS — ordenadas conforme FIELD_MAP
=========================== */

const ALL_COLUMNS: { key: string; label: string }[] = [
  { key: "phone",        label: "Telefone 1" },
  { key: "phone2",       label: "Telefone 2" },
  { key: "phone3",       label: "Telefone 3" },
  { key: "phone4",       label: "Telefone 4" },
  { key: "ddd",          label: "DDD" },
  { key: "name",         label: "Nome" },
  { key: "cpf",          label: "CPF" },
  { key: "cnpj",         label: "CNPJ" },
  { key: "email",        label: "Email" },
  { key: "address",      label: "Logradouro" },
  { key: "number",       label: "Número" },
  { key: "complement",   label: "Complemento" },
  { key: "neighborhood", label: "Bairro" },
  { key: "city",         label: "Cidade" },
  { key: "state",        label: "UF" },
  { key: "cep",          label: "CEP" },
  { key: "purchaseDate", label: "Dt. Últ. Compra" },
  { key: "produto",      label: "Produto" },
  { key: "quantidade",   label: "Quantidade" },
  { key: "ticketAverage",label: "Ticket Médio" },
];

/* ===========================
   FORMATAÇÃO DE VALORES NA EXPORTAÇÃO
   - Telefone 1~4: se há DDD, formata como "62 | 99999-9999"
   - DDD: exibe o valor bruto (coluna separada)
   - Demais campos: valor direto
=========================== */

function formatExportValue(r: any, key: string): string {
  const phoneKeys = ["phone", "phone2", "phone3", "phone4"];
  if (phoneKeys.includes(key)) {
    const phone = r[key];
    if (!phone) return "";
    const ddd = r["ddd"];
    if (ddd) return `${ddd} | ${phone}`;
    return phone;
  }
  return r[key] ?? "";
}

type DedupeType = "phone" | "phone9" | "name" | "cpf" | "cnpj" | "combined";

interface DedupePreview {
  duplicateGroups: number;
  toRemove: number;
  toKeep: number;
}

export default function Export() {
  const { records, setRecords, loading, fetchRecords } = useConsolidatedData();
  const [deleting, setDeleting] = useState(false);

  const [selectedCols, setSelectedCols] = useState<string[]>(
    ALL_COLUMNS.map((c) => c.key)
  );

  // Filtros de conteúdo — texto
  const [filterCity, setFilterCity]       = useState("");
  const [filterState, setFilterState]     = useState("");
  const [filterProduct, setFilterProduct] = useState("");

  // Filtros granulares de exclusão — cada um é independente
  const [filterSemEngano,      setFilterSemEngano]      = useState(true);
  const [filterSemFalecido,    setFilterSemFalecido]    = useState(true);
  const [filterSomenteComTel,  setFilterSomenteComTel]  = useState(false);
  const [filterSemDuplicados,  setFilterSemDuplicados]  = useState(false);

  // Filtros de campos obrigatórios
  const [onlyWithCpf,     setOnlyWithCpf]     = useState(false);
  const [onlyWithAddress, setOnlyWithAddress] = useState(false);
  const [onlyWithEmail,   setOnlyWithEmail]   = useState(false);

  // Filtro de outras palavras indesejadas (sem gado, xinga, grita)
  const [removeOutros, setRemoveOutros] = useState(true);

  // Deduplicação (banco)
  const [dedupeDialog,  setDedupeDialog]  = useState<DedupeType | null>(null);
  const [dedupePreview, setDedupePreview] = useState<DedupePreview | null>(null);
  const [dedupeLoading, setDedupeLoading] = useState(false);
  const [dedupeRunning, setDedupeRunning] = useState(false);

  const { toast } = useToast();

  /* ===========================
     FILTROS
  =========================== */

  const filteredRecords = useMemo(() => {
    let result = records.filter((r) => {
      // Filtro: Somente com Telefone
      if (filterSomenteComTel && !r.phone && !(r as any).phone2) return false;

      // Filtro: CPF/CNPJ obrigatório
      if (onlyWithCpf && !r.cpf && !(r as any).cnpj) return false;

      // Filtro: Endereço obrigatório
      if (onlyWithAddress && !r.address) return false;

      // Filtro: Email obrigatório
      if (onlyWithEmail && !(r as any).email) return false;

      // Filtro de texto: Cidade
      if (filterCity && !r.city?.toLowerCase().includes(filterCity.toLowerCase())) return false;

      // Filtro de texto: UF
      if (filterState && r.state?.toLowerCase() !== filterState.toLowerCase()) return false;

      // Filtro de texto: Produto
      if (filterProduct) {
        const prod = ((r as any).produto || "").toLowerCase();
        if (!prod.includes(filterProduct.toLowerCase())) return false;
      }

      // Filtro: Sem Engano — exclui registros cujo telefone contém "engano"
      if (filterSemEngano) {
        const allText = Object.values(r).join(" ").toLowerCase();
        if (/\bengano\b/.test(allText)) return false;
      }

      // Filtro: Sem Falecido — exclui registros com "falecido"
      if (filterSemFalecido) {
        const allText = Object.values(r).join(" ").toLowerCase();
        if (/\bfalecido\b/.test(allText)) return false;
      }

      // Filtro: outras palavras indesejadas (sem gado, xinga, grita)
      if (removeOutros) {
        const row = Object.values(r).join(" ").toLowerCase();
        const bad = [/\bsem\s+gado\b/, /\bs\/\s*gado\b/, /\bxinga\b/, /\bgrita\b/];
        if (bad.some((rx) => rx.test(row))) return false;
      }

      return true;
    });

    // Filtro: Sem telefones duplicados — mantém apenas um registro por número de telefone
    if (filterSemDuplicados) {
      const seenPhones = new Set<string>();
      result = result.filter((r) => {
        const phone = ((r.phone || "") as string).replace(/\D/g, "");
        if (!phone) return true; // sem telefone: mantém (não é duplicata de ninguém)
        if (seenPhones.has(phone)) return false;
        seenPhones.add(phone);
        return true;
      });
    }

    return result;
  }, [
    records,
    filterSomenteComTel, onlyWithCpf, onlyWithAddress, onlyWithEmail,
    filterCity, filterState, filterProduct,
    filterSemEngano, filterSemFalecido, filterSemDuplicados, removeOutros,
  ]);

  const removed = records.length - filteredRecords.length;

  const toggleCol = (key: string) => {
    setSelectedCols((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const activeCols = ALL_COLUMNS.filter((c) => selectedCols.includes(c.key));

  /* ===========================
     DEDUPLICAÇÃO (banco)
  =========================== */

  const DEDUPE_OPTIONS: { type: DedupeType; label: string; desc: string }[] = [
    { type: "phone",    label: "Telefone Exato",       desc: "Mesmo número de telefone (dígitos idênticos)" },
    { type: "phone9",  label: "Telefone + 9º Dígito",  desc: "Normaliza celulares BR com/sem o 9 (ex: 11 9xxxx = 11 xxxx)" },
    { type: "name",    label: "Nome Exato",             desc: "Mesmo nome normalizado (sem acentos, caixa baixa)" },
    { type: "cpf",     label: "CPF",                   desc: "Mesmo CPF (11 dígitos)" },
    { type: "cnpj",    label: "CNPJ",                  desc: "Mesmo CNPJ (14 dígitos)" },
    { type: "combined",label: "Combinado (Tel + Nome)", desc: "Telefone normalizado E nome juntos" },
  ];
  const dedupeOption = DEDUPE_OPTIONS.find(o => o.type === dedupeDialog);

  const openDedupeDialog = async (type: DedupeType) => {
    setDedupeDialog(type);
    setDedupePreview(null);
    setDedupeLoading(true);
    try {
      const res = await fetch(`/api/dedup-preview?type=${type}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDedupePreview(data);
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível analisar duplicatas." });
      setDedupeDialog(null);
    } finally {
      setDedupeLoading(false);
    }
  };

  const runDedupe = async () => {
    if (!dedupeDialog) return;
    setDedupeRunning(true);
    try {
      const res = await fetch("/api/dedup-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: dedupeDialog }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast({
        title: "Duplicatas removidas",
        description: `${data.removed} registros movidos p/ lixeira. ${data.kept} mantidos.`,
      });
      setDedupeDialog(null);
      setDedupePreview(null);
      fetchRecords();
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Falha ao remover duplicatas." });
    } finally {
      setDedupeRunning(false);
    }
  };

  /* ===========================
     EXPORTAR CSV (UTF-8 com BOM)
  =========================== */

  const exportCSV = () => {
    if (!filteredRecords.length) {
      toast({ variant: "destructive", title: "Nada para exportar" });
      return;
    }
    const headers = activeCols.map((c) => c.label).join(";");
    const rows = filteredRecords.map((r) =>
      activeCols.map(({ key }) => {
        const v = formatExportValue(r as any, key);
        if (v == null || v === "") return "";
        return `"${v.toString().replace(/"/g, '""')}"`;
      }).join(";")
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consolidado-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exportado", description: `${filteredRecords.length} registros` });
  };

  /* ===========================
     EXPORTAR EXCEL
  =========================== */

  const exportExcel = async () => {
    if (!filteredRecords.length) {
      toast({ variant: "destructive", title: "Nada para exportar" });
      return;
    }
    const XLSX = await import("xlsx");
    const rows = filteredRecords.map((r) => {
      const obj: Record<string, any> = {};
      activeCols.forEach(({ key, label }) => {
        obj[label] = formatExportValue(r as any, key);
      });
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consolidado");
    XLSX.writeFile(wb, `consolidado-${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Excel exportado", description: `${filteredRecords.length} registros` });
  };

  /* ===========================
     EXCLUIR TUDO (soft delete)
  =========================== */

  const deleteAll = async () => {
    if (!confirm(`Mover todos os ${records.length} registros para a lixeira?`)) return;
    setDeleting(true);
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
      toast({ variant: "destructive", title: "Erro", description: "Falha ao excluir." });
    } finally {
      setDeleting(false);
    }
  };

  /* ===========================
     UI
  =========================== */

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <RefreshCw className="animate-spin mr-2" size={20} />
        <span>Carregando dados...</span>
      </div>
    );
  }

  return (
    <div className="p-4 h-full flex flex-col gap-3 overflow-hidden">
      {/* CABEÇALHO */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Exportar Dados</h1>
          <p className="text-xs text-muted-foreground">Configure filtros e colunas antes de exportar</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={fetchRecords}>
            <RefreshCw size={13} className="mr-1" /> Atualizar
          </Button>
          {records.length > 0 && (
            <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={deleteAll} disabled={deleting}>
              <Trash2 size={13} className="mr-1" />
              {deleting ? "Movendo..." : "Mover Tudo p/ Lixeira"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">

        {/* PAINEL DE CONFIGURAÇÕES */}
        <div className="flex flex-col gap-3 max-w-lg">

          {/* REMOVER DUPLICATAS NO BANCO */}
          {records.length > 0 && (
            <Card className="border-orange-200 bg-orange-50/40 dark:bg-orange-950/10 dark:border-orange-900">
              <CardHeader className="py-2 px-4 border-b border-orange-200 dark:border-orange-900">
                <CardTitle className="text-sm flex items-center gap-1.5 text-orange-700 dark:text-orange-400">
                  <ScanSearch size={14} /> Remover Duplicatas no Banco
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-1.5 text-xs">
                <p className="text-muted-foreground text-[11px] mb-2">
                  Mantém o registro com mais campos preenchidos e move os demais para a lixeira.
                </p>
                {DEDUPE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.type}
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-[11px] justify-start border-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                    onClick={() => openDedupeDialog(opt.type)}
                  >
                    <ScanSearch size={11} className="mr-1.5 shrink-0" />
                    <span className="font-medium">{opt.label}</span>
                    <span className="ml-1 text-muted-foreground hidden lg:inline truncate"> — {opt.desc}</span>
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* FILTROS DE EXCLUSÃO GRANULARES */}
          <Card>
            <CardHeader className="py-2 px-4 border-b">
              <CardTitle className="text-sm flex items-center gap-1">
                <Filter size={14} /> Filtros de Exclusão
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">Cada filtro é independente. Aplicados sobre os dados em memória — não alteram o banco.</p>
            </CardHeader>
            <CardContent className="p-3 space-y-2 text-xs">

              {/* Filtros granulares */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Filtros individuais:</Label>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="chk-sem-engano"
                    checked={filterSemEngano}
                    onCheckedChange={(v) => setFilterSemEngano(v === true)}
                  />
                  <Label htmlFor="chk-sem-engano" className="text-xs cursor-pointer">
                    <span className="font-medium">Sem Engano</span>
                    <span className="text-muted-foreground ml-1">— exclui registros com a palavra "engano"</span>
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="chk-sem-falecido"
                    checked={filterSemFalecido}
                    onCheckedChange={(v) => setFilterSemFalecido(v === true)}
                  />
                  <Label htmlFor="chk-sem-falecido" className="text-xs cursor-pointer">
                    <span className="font-medium">Sem Falecido</span>
                    <span className="text-muted-foreground ml-1">— exclui registros com a palavra "falecido"</span>
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="chk-somente-tel"
                    checked={filterSomenteComTel}
                    onCheckedChange={(v) => setFilterSomenteComTel(v === true)}
                  />
                  <Label htmlFor="chk-somente-tel" className="text-xs cursor-pointer">
                    <span className="font-medium">Somente com Telefone</span>
                    <span className="text-muted-foreground ml-1">— exclui registros sem telefone/celular</span>
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="chk-sem-dup"
                    checked={filterSemDuplicados}
                    onCheckedChange={(v) => setFilterSemDuplicados(v === true)}
                  />
                  <Label htmlFor="chk-sem-dup" className="text-xs cursor-pointer">
                    <span className="font-medium">Sem Telefones Duplicados</span>
                    <span className="text-muted-foreground ml-1">— mantém apenas um registro por número</span>
                  </Label>
                </div>
              </div>

              {/* Filtros de campos obrigatórios */}
              <div className="space-y-1.5 pt-2 border-t">
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Obrigatório ter:</Label>
                <div className="flex items-center gap-2">
                  <Checkbox id="chk-cpf" checked={onlyWithCpf} onCheckedChange={(v) => setOnlyWithCpf(v === true)} />
                  <Label htmlFor="chk-cpf" className="text-xs cursor-pointer">CPF/CNPJ preenchido</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="chk-addr" checked={onlyWithAddress} onCheckedChange={(v) => setOnlyWithAddress(v === true)} />
                  <Label htmlFor="chk-addr" className="text-xs cursor-pointer">Endereço preenchido</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="chk-email" checked={onlyWithEmail} onCheckedChange={(v) => setOnlyWithEmail(v === true)} />
                  <Label htmlFor="chk-email" className="text-xs cursor-pointer">Email preenchido</Label>
                </div>
              </div>

              {/* Outras palavras indesejadas */}
              <div className="space-y-1.5 pt-2 border-t">
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Outras palavras indesejadas:</Label>
                <div className="flex items-center gap-2">
                  <Checkbox id="chk-outros" checked={removeOutros} onCheckedChange={(v) => setRemoveOutros(v === true)} />
                  <Label htmlFor="chk-outros" className="text-xs cursor-pointer">Remover: SEM GADO, XINGA, GRITA</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* FILTROS DE TEXTO */}
          <Card>
            <CardHeader className="py-2 px-4 border-b">
              <CardTitle className="text-sm flex items-center gap-1">
                <Filter size={14} /> Filtros de Conteúdo
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-2.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] mb-1 block">Cidade</Label>
                  <Input
                    placeholder="Ex: São Paulo"
                    className="h-7 text-xs"
                    value={filterCity}
                    onChange={(e) => setFilterCity(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-[11px] mb-1 block">UF</Label>
                  <Input
                    placeholder="Ex: SP"
                    className="h-7 text-xs"
                    value={filterState}
                    onChange={(e) => setFilterState(e.target.value.toUpperCase())}
                    maxLength={2}
                  />
                </div>
              </div>
              <div>
                <Label className="text-[11px] mb-1 block">Produto</Label>
                <Input
                  placeholder="Filtrar por produto..."
                  className="h-7 text-xs"
                  value={filterProduct}
                  onChange={(e) => setFilterProduct(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* SELEÇÃO DE COLUNAS */}
          <Card>
            <CardHeader className="py-2 px-4 border-b">
              <CardTitle className="text-sm">Colunas para Exportar</CardTitle>
              <p className="text-[11px] text-muted-foreground">Ordenadas conforme o mapa de busca</p>
            </CardHeader>
            <CardContent className="p-3 space-y-1.5 text-xs">
              <div className="flex gap-2 mb-2">
                <button className="text-[11px] text-primary underline" onClick={() => setSelectedCols(ALL_COLUMNS.map(c => c.key))}>Todas</button>
                <button className="text-[11px] text-muted-foreground underline" onClick={() => setSelectedCols([])}>Nenhuma</button>
              </div>
              {ALL_COLUMNS.map((col) => (
                <div key={col.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`col-${col.key}`}
                    checked={selectedCols.includes(col.key)}
                    onCheckedChange={() => toggleCol(col.key)}
                  />
                  <Label htmlFor={`col-${col.key}`} className="text-xs cursor-pointer">{col.label}</Label>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* RESULTADO + BOTÕES */}
          <Card>
            <CardContent className="p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Total carregado:</span>
                <strong>{records.length}</strong>
              </div>
              <div className="flex justify-between">
                <span>Após filtros:</span>
                <strong className="text-green-600">{filteredRecords.length}</strong>
              </div>
              <div className="flex justify-between">
                <span>Removidos pelos filtros:</span>
                <strong className="text-red-500">{removed}</strong>
              </div>
              <div className="flex justify-between">
                <span>Colunas selecionadas:</span>
                <strong>{activeCols.length}</strong>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button size="sm" className="h-8 text-xs gap-1" onClick={exportCSV} disabled={!filteredRecords.length}>
                  <Download size={13} /> CSV
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={exportExcel} disabled={!filteredRecords.length}>
                  <FileSpreadsheet size={13} /> Excel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* DIALOG DE CONFIRMAÇÃO DE DEDUPLICAÇÃO */}
      <Dialog
        open={!!dedupeDialog}
        onOpenChange={(open) => {
          if (!open && !dedupeRunning) { setDedupeDialog(null); setDedupePreview(null); }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanSearch size={16} />
              Remover duplicatas — {dedupeOption?.label}
            </DialogTitle>
            <DialogDescription>
              {dedupeOption?.desc}. O registro com mais campos preenchidos é mantido;
              os demais são movidos para a lixeira (podem ser restaurados).
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {dedupeLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                <RefreshCw size={16} className="animate-spin" />
                Analisando duplicatas...
              </div>
            ) : dedupePreview ? (
              dedupePreview.toRemove === 0 ? (
                <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-4 text-center">
                  <p className="text-green-700 dark:text-green-400 font-medium text-sm">
                    Nenhuma duplicata encontrada por <em>{dedupeOption?.label}</em>!
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Todos os {dedupePreview.toKeep} registros analisados são únicos.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-2xl font-bold text-orange-600">{dedupePreview.duplicateGroups}</p>
                      <p className="text-[11px] text-muted-foreground">Grupos</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-red-600">{dedupePreview.toRemove}</p>
                      <p className="text-[11px] text-muted-foreground">Para lixeira</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-600">{dedupePreview.toKeep}</p>
                      <p className="text-[11px] text-muted-foreground">Mantidos</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Os registros removidos ficam na lixeira e podem ser restaurados.
                  </p>
                </div>
              )
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDedupeDialog(null); setDedupePreview(null); }}
              disabled={dedupeRunning}
            >
              Cancelar
            </Button>
            {dedupePreview && dedupePreview.toRemove > 0 && (
              <Button
                variant="destructive"
                onClick={runDedupe}
                disabled={dedupeRunning}
              >
                {dedupeRunning
                  ? <><RefreshCw size={14} className="mr-1.5 animate-spin" /> Removendo...</>
                  : `Mover ${dedupePreview.toRemove} p/ lixeira`
                }
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
