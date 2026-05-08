import {
  type UploadedFile,
  type InsertConsolidatedRecord,
  uploadedFiles,
  sheetMetadata,
  columnMappings,
  consolidatedRecords,
} from "@shared/schema";
import { db } from "./db";
import { eq, inArray, isNull } from "drizzle-orm";
import XLSX from "xlsx";
import { parse } from "csv-parse";
import { progressBus } from "./progress";

/* ===========================
   HELPERS — NORMALIZAÇÃO
=========================== */

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

const cleanNumber = (value: any) => {
  if (!value) return null;
  const v = value.toString().replace(/\D/g, "");
  return v || null;
};

const filledCount = (obj: any) =>
  Object.values(obj).filter((v) => v !== null && v !== "" && v !== undefined).length;

/* ===========================
   HELPERS — IDENTIDADE
=========================== */

function phoneDigits(value: any): string | null {
  if (!value) return null;
  const d = value.toString().replace(/\D/g, "");
  return d || null;
}

function canonicalPhone(digits: string | null): string | null {
  if (!digits) return null;
  if (digits.length === 11 && digits[2] === "9") {
    return digits.substring(0, 2) + digits.substring(3);
  }
  return digits;
}

function normalizeName(name: any): string {
  if (!name) return "";
  return name
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function nameSimilarity(a: any, b: any): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  const tokA = na.split(" ").filter((t) => t.length > 2);
  const tokB = nb.split(" ").filter((t) => t.length > 2);
  if (!tokA.length || !tokB.length) return 0;
  const common = tokA.filter((t) => tokB.includes(t)).length;
  return common / Math.max(tokA.length, tokB.length);
}

/**
 * Mescla dois registros: preenche os campos VAZIOS de `dst` com valores de `src`.
 * Nunca sobrescreve um campo que já tem valor — NENHUM dado é descartado.
 */
function mergeInto(
  dst: InsertConsolidatedRecord,
  src: InsertConsolidatedRecord
): InsertConsolidatedRecord {
  const result = { ...dst };
  const fields: (keyof InsertConsolidatedRecord)[] = [
    "name", "cpf", "cnpj", "phone", "phone2", "phone3", "phone4", "ddd", "email",
    "address", "number", "complement", "neighborhood",
    "city", "state", "cep",
    "ticketAverage", "purchaseDate", "produto", "quantidade",
  ];
  for (const f of fields) {
    const cur = result[f];
    if ((cur === null || cur === undefined || cur === "") && src[f]) {
      (result as any)[f] = src[f];
    }
  }
  return result;
}

/* ===========================
   CPF vs CNPJ
=========================== */

function splitCpfCnpj(raw: any): { cpf: string | null; cnpj: string | null } {
  if (!raw) return { cpf: null, cnpj: null };
  const digits = raw.toString().replace(/\D/g, "");
  if (digits.length === 11) return { cpf: digits, cnpj: null };
  if (digits.length === 14) return { cpf: null, cnpj: digits };
  if (digits.length > 0 && digits.length < 12) return { cpf: digits, cnpj: null };
  if (digits.length > 11) return { cpf: null, cnpj: digits };
  return { cpf: null, cnpj: null };
}

/* ===========================
   FIELD MAP
   Ordem determinística — uma planilha segue a outra,
   colunas ordenadas conforme regra do mapa de busca.
=========================== */

const FIELD_MAP = {
  name: [
    "nome", "nomecompleto", "nome completo", "name", "cliente", "nome cliente",
    "nome do cliente", "comprador", "proprietario", "segurado", "paciente",
    "funcionario", "colaborador", "consumidor", "pessoa", "razao social",
    "titular", "socio", "representante", "responsavel", "diretor", "vendedor",
  ],
  cpf: [
    "cpf", "cpf do cliente", "cpf_cliente", "cpfcliente", "cpf cliente",
  ],
  cnpj: [
    "cnpj", "cnpjempresa", "cnpj empresa", "cgc", "cnpj do cliente",
  ],
  cpfCnpj: [
    "cpf cnpj", "cpfcnpj", "documento", "doc", "cpf ou cnpj",
    "cpf/cnpj", "cpfoucnpj", "cpf_cnpj",
  ],
  phone: [
    "telefone", "tel", "fone", "phone", "ramal", "fax",
    "contato", "tel 1", "telefone 1", "numero",
    "telefone fixo", "tel fixo", "fixo", "residencial",
  ],
  phone2: [
    "celular", "cel", "movel", "mobile", "telefonecelular", "telcel",
    "fonecelular", "telefonemovel", "fonemovel", "celulartel",
    "whatsapp", "wpp", "zap", "telefone celular", "tel celular",
    "numero celular", "celular1", "cel1", "telefone2", "tel2",
    "fone2", "phone2", "tel 2", "telefone 2", "celular2",
    "cel2", "whatsapp2", "fone 2", "contato2",
  ],
  phone3: [
    "telefone3", "tel3", "fone3", "phone3", "tel 3", "telefone 3",
    "celular3", "cel3", "whatsapp3", "fone 3", "contato3",
  ],
  phone4: [
    "telefone4", "tel4", "fone4", "phone4", "tel 4", "telefone 4",
    "celular4", "cel4", "whatsapp4", "fone 4", "contato4",
  ],
  // ← NOVO: DDD em coluna separada da planilha de entrada
  ddd: [
    "ddd", "cod area", "codigo area", "codigo de area",
    "area code", "areacode", "prefixo", "cod. area",
  ],
  email: [
    "email", "e-mail", "mail", "correio", "emailaddress", "email address",
    "e mail", "emailcliente", "email cliente", "email do cliente",
  ],
  address: [
    "endereco", "logradouro", "address", "rua", "r.", "avenida", "av", "av.",
    "alameda", "travessa", "estrada", "rodovia", "end", "logr",
  ],
  number: ["numero", "nro", "num", "number", "no"],
  complement: [
    "complemento", "compl", "comp", "apto", "apartamento", "casa", "bloco", "sala", "apt",
  ],
  neighborhood: ["bairro", "district", "neighborhood"],
  city: ["cidade", "municipio", "localidade", "city"],
  state: ["estado", "uf", "sigla", "est", "provincia", "state"],
  cep: ["cep", "zip", "zipcode", "postalcode", "codigo postal"],
  ticketAverage: [
    "ticket medio", "ticketmedio", "ticket", "faturamento",
    "valor", "valor compra", "valor total", "total", "preco", "price",
    "valor pedido", "valor do pedido", "valor nota", "valor de nota",
    "valor nf", "vl pedido", "vl total", "vl nota", "vlpedido", "vltotal",
    "valornota", "valorpedido", "valorcompra", "valortotal",
    "total pedido", "total nota", "nf valor", "nota fiscal valor",
    "preco total", "preco unitario", "valor unitario", "vl unitario",
  ],
  purchaseDate: [
    "data compra", "datacompra", "data", "dt", "data venda", "datavenda",
    "ultima compra", "data_venda", "date", "dataemissao", "data emissao",
    "dt. ult. compra", "dt ult compra", "dtultcompra",
    "data pedido", "datapedido", "dt pedido", "dtpedido",
    "data saida", "datasaida", "dt saida", "dtsaida", "data de saida",
    "data faturamento", "datafaturamento", "dt faturamento", "dtfaturamento",
    "data de faturamento", "data nota", "data nf", "datanf",
    "data emissao nota", "data lancamento", "data entrada",
    "data movimento", "data operacao", "data transacao",
  ],
  produto: [
    "produto", "product", "mercadoria", "item", "descricao produto",
    "descricaoproduto", "nome produto", "nomeproduto", "servico",
    "descricao", "desc produto", "desc item",
  ],
  quantidade: [
    "quantidade", "qtd", "qt", "qtde", "qty", "quant", "qnt",
    "qtdade", "qtidade",
  ],
};

/* ===========================
   BATCH SIZE — otimizado para Supabase/Render
=========================== */
const INSERT_BATCH    = 500;
const UPDATE_CHUNK    = 20;
const REPORT_EVERY    = 200;
const ROW_FLUSH_EVERY = 500;

/* ===========================
   ESTRUTURA DE MERGE EM MEMÓRIA
=========================== */

interface MergeEntry {
  id: string | null;
  record: InsertConsolidatedRecord & { id?: string };
  dirty: boolean;
}

/* ===========================
   DETECÇÃO DE ENCODING CSV/TXT
=========================== */

function detectAndDecode(buffer: Buffer): string {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString("utf-8");
  }
  const utf8 = buffer.toString("utf-8");
  const replacements = (utf8.match(/\uFFFD/g) || []).length;
  if (replacements > 5) {
    return buffer.toString("latin1");
  }
  return utf8;
}

function detectDelimiter(firstLine: string): string {
  const counts: Record<string, number> = {
    ",": (firstLine.match(/,/g) || []).length,
    ";": (firstLine.match(/;/g) || []).length,
    "|": (firstLine.match(/\|/g) || []).length,
    "\t": (firstLine.match(/\t/g) || []).length,
  };
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : ",";
}

/* ===========================
   STORAGE
=========================== */

export class DatabaseStorage {

  async getAllFiles() {
    return await db.select().from(uploadedFiles).orderBy(uploadedFiles.createdAt);
  }

  async deleteFile(id: string) {
    await db.delete(uploadedFiles).where(eq(uploadedFiles.id, id));
  }

  async deleteAllFiles() {
    await db.delete(uploadedFiles);
  }

  async getAllConsolidated() {
    return await db
      .select()
      .from(consolidatedRecords)
      .where(isNull(consolidatedRecords.deletedAt))
      .orderBy(consolidatedRecords.createdAt);
  }

  async getDeletedConsolidated() {
    return await db
      .select()
      .from(consolidatedRecords)
      .where(eq(consolidatedRecords.deletedAt, consolidatedRecords.deletedAt))
      .orderBy(consolidatedRecords.updatedAt);
  }

  async softDeleteConsolidatedByIds(ids: string[]): Promise<number> {
    if (!ids || ids.length === 0) return 0;
    const CHUNK = 500;
    let deleted = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const result = await db
        .update(consolidatedRecords)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(inArray(consolidatedRecords.id, chunk))
        .returning({ id: consolidatedRecords.id });
      deleted += result.length;
    }
    return deleted;
  }

  async restoreConsolidatedByIds(ids: string[]): Promise<number> {
    if (!ids || ids.length === 0) return 0;
    const CHUNK = 500;
    let restored = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const result = await db
        .update(consolidatedRecords)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(inArray(consolidatedRecords.id, chunk))
        .returning({ id: consolidatedRecords.id });
      restored += result.length;
    }
    return restored;
  }

  async hardDeleteConsolidatedByIds(ids: string[]): Promise<number> {
    if (!ids || ids.length === 0) return 0;
    const CHUNK = 500;
    let deleted = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const result = await db
        .delete(consolidatedRecords)
        .where(inArray(consolidatedRecords.id, chunk))
        .returning({ id: consolidatedRecords.id });
      deleted += result.length;
    }
    return deleted;
  }

  async deleteConsolidatedByIds(ids: string[]): Promise<number> {
    return this.softDeleteConsolidatedByIds(ids);
  }

  async previewDeduplicate(type: "phone" | "name") {
    const all = await db
      .select()
      .from(consolidatedRecords)
      .where(isNull(consolidatedRecords.deletedAt));
    const { toDelete, groups } = this._buildDeduplicateIds(all, type);
    return { duplicateGroups: groups, toRemove: toDelete.length, toKeep: all.length - toDelete.length };
  }

  async deduplicate(type: "phone" | "name") {
    const all = await db
      .select()
      .from(consolidatedRecords)
      .where(isNull(consolidatedRecords.deletedAt));
    const { toDelete } = this._buildDeduplicateIds(all, type);
    if (toDelete.length > 0) {
      await this.softDeleteConsolidatedByIds(toDelete);
    }
    return { removed: toDelete.length, kept: all.length - toDelete.length };
  }

  private _buildDeduplicateIds(all: any[], type: "phone" | "name") {
    const buckets = new Map<string, any[]>();
    for (const record of all) {
      let key: string;
      if (type === "phone") {
        const digits = (record.phone || "").replace(/\D/g, "");
        if (!digits) continue;
        key = digits;
      } else {
        const norm = normalize(record.name || "");
        if (!norm) continue;
        key = norm;
      }
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(record);
    }
    const toDelete: string[] = [];
    let groups = 0;
    for (const group of buckets.values()) {
      if (group.length <= 1) continue;
      groups++;
      group.sort((a: any, b: any) => filledCount(b) - filledCount(a));
      for (let i = 1; i < group.length; i++) toDelete.push(group[i].id);
    }
    return { toDelete, groups };
  }

  async createPendingFile(originalName: string, buffer: Buffer): Promise<UploadedFile> {
    const [uploadedFile] = await db
      .insert(uploadedFiles)
      .values({
        originalName,
        fileType: originalName.split(".").pop()?.toLowerCase() || "unknown",
        fileSize: buffer.length,
        status: "processing",
      })
      .returning();
    return uploadedFile;
  }

  async processFile(fileId: string, originalName: string, buffer: Buffer): Promise<void> {
    const emit = (type: string, msg: string, extra: object = {}) => {
      progressBus.publish({ type, fileId, fileName: originalName, message: msg, ...extra });
    };

    try {
      emit("start", `Lendo ${originalName}…`);

      const ext = originalName.split(".").pop()?.toLowerCase();
      let sheets: { name: string; data: any[] }[] = [];

      if (ext === "csv" || ext === "txt") {
        const csvString = detectAndDecode(buffer);
        const firstLine = csvString.split(/\r?\n/)[0] || "";
        const delimiter = detectDelimiter(firstLine);

        emit("start", `Detectado delimitador: "${delimiter === "\t" ? "TAB" : delimiter}" em ${originalName}`);

        const records: any[] = await new Promise((resolve, reject) => {
          parse(
            csvString,
            {
              columns: true,
              delimiter,
              trim: true,
              skip_empty_lines: true,
              relax_quotes: true,
              bom: true,
            },
            (err, output) => (err ? reject(err) : resolve(output))
          );
        });
        sheets = [{ name: originalName, data: records }];
      } else {
        const workbook = XLSX.read(buffer, {
          type: "buffer",
          raw: true,
          cellDates: false,
          dense: false,
        });
        sheets = workbook.SheetNames.map((name) => ({
          name,
          data: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
            defval: null,
            raw: true,
          }),
        }));
      }

      emit("start", `Carregando base consolidada para mesclagem inteligente…`);
      const existingRecords = await db
        .select()
        .from(consolidatedRecords)
        .where(isNull(consolidatedRecords.deletedAt));

      const entries: MergeEntry[] = existingRecords.map((r) => ({
        id: r.id,
        record: { ...r } as any,
        dirty: false,
      }));

      const cpfIdx   = new Map<string, number>();
      const cnpjIdx  = new Map<string, number>();
      const phoneIdx = new Map<string, number>();

      for (let i = 0; i < entries.length; i++) {
        const r = entries[i].record;
        if (r.cpf)   cpfIdx.set(r.cpf, i);
        if (r.cnpj)  cnpjIdx.set(r.cnpj, i);
        if (r.phone) {
          const cp = canonicalPhone(phoneDigits(r.phone));
          if (cp) phoneIdx.set(cp, i);
        }
      }

      let totalRows   = 0;
      let totalNew    = 0;
      let totalMerged = 0;
      let firstSheetColumnCount = 0;

      for (let sheetIdx = 0; sheetIdx < sheets.length; sheetIdx++) {
        const sheet = sheets[sheetIdx];
        if (!sheet.data.length) continue;

        emit("sheet", `Aba ${sheetIdx + 1}/${sheets.length}: "${sheet.name}" — ${sheet.data.length} linhas`, {
          currentSheet: sheet.name,
          sheetIndex: sheetIdx,
          totalSheets: sheets.length,
          totalRows: sheet.data.length,
        });

        const headers = Object.keys(sheet.data[0]).map(normalize);
        if (sheetIdx === 0) firstSheetColumnCount = headers.length;

        const [meta] = await db
          .insert(sheetMetadata)
          .values({
            fileId,
            sheetName: sheet.name,
            sheetIndex: sheetIdx,
            rowCount: sheet.data.length,
            columnCount: headers.length,
            columnNames: headers,
          })
          .returning();

        if (headers.length > 0) {
          await db.insert(columnMappings).values(
            headers.map((h, i) => ({ sheetId: meta.id, originalColumnName: h, columnIndex: i }))
          );
        }

        const sheetNewEntryIndices: number[] = [];
        const sheetDirtyExistingIds: Set<number> = new Set();
        let sheetInsertedCount = 0;

        const flushNewEntries = async () => {
          if (sheetNewEntryIndices.length === 0) return;
          const pending = sheetNewEntryIndices.splice(0);

          for (let i = 0; i < pending.length; i += INSERT_BATCH) {
            const batchIndices = pending.slice(i, i + INSERT_BATCH);
            const batchRecords = batchIndices.map((idx) => entries[idx].record as InsertConsolidatedRecord);
            const inserted = await db
              .insert(consolidatedRecords)
              .values(batchRecords)
              .returning({ id: consolidatedRecords.id });

            inserted.forEach((row, batchOffset) => {
              const entryIdx = batchIndices[batchOffset];
              if (entryIdx !== undefined) {
                entries[entryIdx].id    = row.id;
                entries[entryIdx].dirty = false;
              }
            });
            sheetInsertedCount += inserted.length;
          }
        };

        for (let rowIdx = 0; rowIdx < sheet.data.length; rowIdx++) {
          const row = sheet.data[rowIdx];

          if (rowIdx % REPORT_EVERY === 0 || rowIdx === sheet.data.length - 1) {
            const pct = Math.round(((rowIdx + 1) / sheet.data.length) * 100);
            emit("row", `Linha ${rowIdx + 1}/${sheet.data.length} (${pct}%) — ${totalNew} novos, ${totalMerged} mesclados`, {
              currentRow: rowIdx + 1,
              totalRows: sheet.data.length,
              currentSheet: sheet.name,
              percent: pct,
              insertedTotal: totalNew + totalMerged,
            });
          }

          const normalizedRow: Record<string, any> = {};
          for (const [k, v] of Object.entries(row as Record<string, any>)) {
            normalizedRow[normalize(k)] = typeof v === "string" ? v.trim() : v;
          }

          const getField = (keys: string[]) => {
            for (const key of keys) {
              const v = normalizedRow[normalize(key)];
              if (v !== undefined && v !== null && v !== "") return v;
            }
            return null;
          };

          const rawCpf   = getField(FIELD_MAP.cpf);
          const rawCnpj  = getField(FIELD_MAP.cnpj);
          const rawMixed = getField(FIELD_MAP.cpfCnpj);

          let cpfValue: string | null  = rawCpf  ? cleanNumber(rawCpf)  : null;
          let cnpjValue: string | null = rawCnpj ? cleanNumber(rawCnpj) : null;

          if (rawMixed && (!cpfValue || !cnpjValue)) {
            const { cpf: dCpf, cnpj: dCnpj } = splitCpfCnpj(rawMixed);
            if (!cpfValue)  cpfValue  = dCpf;
            if (!cnpjValue) cnpjValue = dCnpj;
          }

          const rawPhone  = cleanNumber(getField(FIELD_MAP.phone));
          const rawPhone2 = cleanNumber(getField(FIELD_MAP.phone2));
          const rawPhone3 = cleanNumber(getField(FIELD_MAP.phone3));
          const rawPhone4 = cleanNumber(getField(FIELD_MAP.phone4));
          const rawName   = getField(FIELD_MAP.name);
          const rawEmail  = getField(FIELD_MAP.email);

          // Extrai DDD da coluna separada (mantém só dígitos, pega últimos 2)
          const rawDdd = (() => {
            const v = getField(FIELD_MAP.ddd);
            if (!v) return null;
            const digits = v.toString().replace(/\D/g, "");
            // aceita 2 dígitos direto (ex: "62") ou com código do país (ex: "062", "0062")
            return digits.length >= 2 ? digits.slice(-2) : null;
          })();

          // Concatena DDD com telefone/celular quando o número não tem DDD (< 10 dígitos)
          const prependDdd = (phone: string | null, ddd: string | null): string | null => {
            if (!phone || !ddd) return phone;
            if (phone.length >= 10) return phone; // já tem DDD — não duplica
            return ddd + phone;
          };

          const phone1Final = prependDdd(rawPhone,  rawDdd);
          const phone2Final = prependDdd(rawPhone2, rawDdd);
          const phone3Final = prependDdd(rawPhone3, rawDdd);
          const phone4Final = prependDdd(rawPhone4, rawDdd);

          const candidate: InsertConsolidatedRecord = {
            name:         rawName,
            cpf:          cpfValue,
            cnpj:         cnpjValue,
            phone:        phone1Final,
            phone2:       phone2Final,
            phone3:       phone3Final,
            phone4:       phone4Final,
            ddd:          rawDdd,
            email:        rawEmail ? rawEmail.toString().trim() : null,
            address:      getField(FIELD_MAP.address),
            number:       getField(FIELD_MAP.number),
            complement:   getField(FIELD_MAP.complement),
            neighborhood: getField(FIELD_MAP.neighborhood),
            city:         getField(FIELD_MAP.city),
            state:        getField(FIELD_MAP.state),
            cep:          cleanNumber(getField(FIELD_MAP.cep)),
            ticketAverage:getField(FIELD_MAP.ticketAverage)?.toString() || null,
            purchaseDate: getField(FIELD_MAP.purchaseDate)?.toString()  || null,
            produto:      getField(FIELD_MAP.produto),
            quantidade:   getField(FIELD_MAP.quantidade),
            status:       "valid",
            confidence:   80,
            sourceFiles:  [fileId],
          };

          let matchIdx: number | null = null;

          if (candidate.cpf && cpfIdx.has(candidate.cpf)) {
            matchIdx = cpfIdx.get(candidate.cpf)!;
          }
          else if (candidate.cnpj && cnpjIdx.has(candidate.cnpj)) {
            matchIdx = cnpjIdx.get(candidate.cnpj)!;
          }
          else if (candidate.phone) {
            const cp = canonicalPhone(candidate.phone);
            if (cp && phoneIdx.has(cp)) {
              const idx = phoneIdx.get(cp)!;
              const existing = entries[idx].record;
              const sim = nameSimilarity(candidate.name, existing.name);
              const candidateHasName = !!(candidate.name && String(candidate.name).trim());
              const existingHasName  = !!(existing.name  && String(existing.name).trim());

              if (!candidateHasName && !existingHasName) {
                matchIdx = idx;
              } else if (sim >= 0.7) {
                matchIdx = idx;
              }
            }
          }

          if (matchIdx !== null) {
            const entry = entries[matchIdx];
            entry.record = mergeInto(entry.record as InsertConsolidatedRecord, candidate) as any;

            const sf = (entry.record.sourceFiles as string[]) || [];
            if (!sf.includes(fileId)) {
              (entry.record as any).sourceFiles = [...sf, fileId];
            }
            entry.dirty = true;
            if (entry.id !== null) {
              sheetDirtyExistingIds.add(matchIdx);
            }
            totalMerged++;
          } else {
            const newIdx = entries.length;
            entries.push({ id: null, record: candidate as any, dirty: true });
            sheetNewEntryIndices.push(newIdx);

            if (candidate.cpf)   cpfIdx.set(candidate.cpf, newIdx);
            if (candidate.cnpj)  cnpjIdx.set(candidate.cnpj, newIdx);
            if (candidate.phone) {
              const cp = canonicalPhone(candidate.phone);
              if (cp) phoneIdx.set(cp, newIdx);
            }
            totalNew++;
          }

          totalRows++;

          if (sheetNewEntryIndices.length >= ROW_FLUSH_EVERY) {
            emit("batch", `Salvando lote intermediário (${sheetNewEntryIndices.length} registros)…`, {
              insertedTotal: totalNew + totalMerged,
            });
            await flushNewEntries();
          }
        }

        if (sheetNewEntryIndices.length > 0) {
          emit("batch", `Salvando ${sheetNewEntryIndices.length} novos registros da aba "${sheet.name}"…`, {
            insertedTotal: totalNew + totalMerged,
          });
          await flushNewEntries();
        }

        if (sheetDirtyExistingIds.size > 0) {
          const toUpdateChunk = Array.from(sheetDirtyExistingIds).map((i) => entries[i]);
          for (let i = 0; i < toUpdateChunk.length; i += UPDATE_CHUNK) {
            const chunk = toUpdateChunk.slice(i, i + UPDATE_CHUNK);
            await Promise.all(
              chunk.map((entry) =>
                db
                  .update(consolidatedRecords)
                  .set({
                    name:         entry.record.name         ?? null,
                    cpf:          entry.record.cpf          ?? null,
                    cnpj:         entry.record.cnpj         ?? null,
                    phone:        entry.record.phone        ?? null,
                    phone2:       entry.record.phone2       ?? null,
                    phone3:       entry.record.phone3       ?? null,
                    phone4:       entry.record.phone4       ?? null,
                    ddd:          entry.record.ddd          ?? null, // ← NOVO
                    email:        entry.record.email        ?? null,
                    address:      entry.record.address      ?? null,
                    number:       entry.record.number       ?? null,
                    complement:   entry.record.complement   ?? null,
                    neighborhood: entry.record.neighborhood ?? null,
                    city:         entry.record.city         ?? null,
                    state:        entry.record.state        ?? null,
                    cep:          entry.record.cep          ?? null,
                    ticketAverage:entry.record.ticketAverage?? null,
                    purchaseDate: entry.record.purchaseDate ?? null,
                    produto:      entry.record.produto      ?? null,
                    quantidade:   entry.record.quantidade   ?? null,
                    sourceFiles:  entry.record.sourceFiles,
                    updatedAt:    new Date(),
                  })
                  .where(eq(consolidatedRecords.id, entry.id!))
              )
            );
          }
          for (const idx of sheetDirtyExistingIds) {
            entries[idx].dirty = false;
          }
        }

        emit("batch", `✓ Aba "${sheet.name}" concluída — ${sheetInsertedCount} novos registros salvos`, {
          insertedTotal: totalNew + totalMerged,
        });
      }

      const totalConsolidated = totalNew + totalMerged;
      await db
        .update(uploadedFiles)
        .set({
          status:       "completed",
          totalSheets:  sheets.length,
          totalRows:    totalRows,
          totalColumns: firstSheetColumnCount,
        })
        .where(eq(uploadedFiles.id, fileId));

      emit("done", `✓ Concluído! ${totalNew} novos registros, ${totalMerged} atualizados (total: ${totalConsolidated})`, {
        insertedTotal: totalConsolidated,
        percent: 100,
      });
      console.log(`[STORAGE] "${originalName}": ${totalNew} novos, ${totalMerged} mesclados, ${totalRows} linhas processadas`);

    } catch (err: any) {
      await db.update(uploadedFiles).set({ status: "error" }).where(eq(uploadedFiles.id, fileId));
      emit("error", `Erro: ${err?.message || "falha desconhecida"}`);
      console.error(`[STORAGE] Erro em "${originalName}":`, err);
      throw err;
    }
  }

  async updateFileStatus(fileId: string, status: string, extra: any = {}) {
    await db.update(uploadedFiles).set({ status, ...extra }).where(eq(uploadedFiles.id, fileId));
  }

  async createSheetMetadata(data: any) {
    const [meta] = await db.insert(sheetMetadata).values(data).returning();
    return meta;
  }

  async createColumnMapping(data: any) {
    const [mapping] = await db.insert(columnMappings).values(data).returning();
    return mapping;
  }
}

export const storage = new DatabaseStorage();
