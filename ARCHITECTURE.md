# Arquitetura do Sistema — DataForge

## Visão Geral

DataForge é uma aplicação web full-stack para importação, consolidação e exportação de listas de contatos a partir de arquivos CSV, TXT e Excel (XLSX/XLS). O sistema realiza deduplicação inteligente por CPF, CNPJ e telefone canonicalizado, mantendo uma base consolidada no banco de dados.

---

## Infraestrutura de Produção

| Recurso | Especificação |
|---|---|
| Servidor | VPS KingHost |
| RAM | 4 GB |
| Armazenamento | 50 GB SSD |
| CPUs | 2 vCPUs |
| Heap Node.js | `--max-old-space-size=512` (512 MB) |
| Banco de Dados | PostgreSQL (Supabase) |

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, Vite 7, TailwindCSS 4, TanStack Query 5 |
| Backend | Node.js 20, Express 4, TypeScript 5.6 |
| ORM | Drizzle ORM + drizzle-kit |
| Banco de Dados | PostgreSQL (Supabase) |
| Sessão | express-session + MemoryStore |
| Parsing CSV | csv-parse 6 |
| Parsing Excel | xlsx (SheetJS) |
| Progresso em tempo real | Server-Sent Events (SSE) via EventEmitter interno |
| Runtime TS (dev) | tsx (ESM loader) |

---

## Estrutura de Diretórios

```
/
├── client/                   # Frontend React
│   └── src/
│       ├── pages/
│       │   ├── Import.tsx        # Upload e acompanhamento de progresso
│       │   ├── Export.tsx        # Exportação da base consolidada (filtros granulares)
│       │   ├── Consolidation.tsx # Visualização e edição de registros
│       │   ├── Analysis.tsx      # Análise de colunas e mapeamento
│       │   ├── Dashboard.tsx     # Painel resumo
│       │   ├── AuditLog.tsx      # Histórico de ações
│       │   ├── Admin.tsx         # Gestão de usuários
│       │   └── Login.tsx         # Autenticação
│       └── ...
├── server/                   # Backend Express
│   ├── index.ts              # Bootstrap do servidor Express
│   ├── routes.ts             # Endpoints REST + fila serializada + SSE
│   ├── storage.ts            # Lógica de parsing + merge + persistência
│   ├── auth.ts               # Autenticação com passport-local
│   ├── auditRoutes.ts        # Rotas de log de auditoria
│   ├── auditLog.ts           # Registro de eventos de auditoria
│   ├── dedup.ts              # Deduplicação pós-import (previewDedup / runDedup)
│   ├── fileProcessor.ts      # Detecção de cabeçalhos e análise de colunas
│   ├── progress.ts           # ProgressBus (EventEmitter p/ SSE)
│   ├── db.ts                 # Pool pg + instância Drizzle
│   ├── static.ts             # Servir build do frontend (produção)
│   └── vite.ts               # Dev middleware Vite (desenvolvimento)
├── shared/
│   └── schema.ts             # Tabelas Drizzle + tipos Zod compartilhados
├── script/
│   ├── build.ts              # Build script (esbuild + vite)
│   └── exportar_leads.py     # Script Python para exportação local com filtros
├── exports/                  # Planilhas geradas pelo script Python
├── requirements.txt          # Dependências Python para o script de exportação
├── GUIA_EXPORTACAO_LOCAL.md  # Guia de uso do script Python local
├── package.json
└── ARCHITECTURE.md
```

---

## Banco de Dados — Schema

### `users`
Autenticação de usuários. Campos: `id`, `username`, `email`, `password_hash`, `role` (`admin`/`user`), `blocked`, `createdAt`.

### `audit_logs`
Registro imutável de ações: login, upload, exclusão, dedup. Campos: `actorId`, `actorUsername`, `action`, `targetId`, `details`, `ip`, `userAgent`, `success`.

### `uploaded_files`
Representa cada arquivo enviado. Status: `pending` → `processing` → `completed` / `error`. Campos contadores: `totalSheets`, `totalRows`, `totalColumns`.

### `sheet_metadata`
Uma linha por aba de planilha (ou uma linha por CSV). Referencia `uploaded_files` via FK com cascade delete. Armazena `columnNames` como JSONB.

### `column_mappings`
Um registro por coluna detectada. Referencia `sheet_metadata`. Campos: `originalColumnName`, `mappedFieldName`, `confidence`, `sampleValues`.

### `consolidated_records`
A base consolidada de contatos. Campos pessoais (nome, CPF, CNPJ, 4 telefones, DDD, email), endereço completo, campos comerciais (ticket médio, data de compra, produto, quantidade), metadata (`status`, `confidence`, `sourceFiles[]`, `mergedFrom[]`) e soft-delete via `deletedAt`.

---

## Fluxo de Upload e Processamento

```
Cliente (Import.tsx)
  │
  ├─ POST /api/files/upload  (multipart, buffer em memória — Multer memoryStorage)
  │    │
  │    ├─ Cria registro em uploaded_files (status: "pending")
  │    ├─ Enfileira storage.processFile() na fila serializada
  │    └─ Retorna { fileId }
  │
  └─ GET /api/progress/:fileId  (SSE — Server-Sent Events)
       │
       └─ Recebe eventos: start → sheet → row → batch → done / error
```

### Fila Serializada (`routes.ts`)
Apenas **um arquivo é processado por vez**. Isso evita:
- Esgotamento do pool de conexões do Supabase (máx. 5 conexões configuradas)
- Race conditions no merge quando dois arquivos leem a base simultaneamente
- Timeouts de statement por sobrecarga paralela

Cada tarefa tem timeout de **5 minutos**. Se excedido, o arquivo recebe status `error` e a fila avança.

### `processFile()` — Fases de Execução (`storage.ts`)

#### Fase 0 — Leitura e Parsing
- **CSV/TXT**: `detectAndDecode(buffer)` converte o buffer para string (UTF-8 com fallback latin1 para BOM/caracteres especiais). O delimitador é auto-detectado na primeira linha (`,` `;` `|` `TAB`). O csv-parse entrega todos os registros como array de objetos.
- **Excel**: SheetJS lê o buffer e converte cada aba via `sheet_to_json`.

#### Fase 1 — Carga da Base Existente
Todos os registros não deletados são carregados em memória. Três índices hash são construídos:
- `cpfIdx: Map<cpf, entryIndex>`
- `cnpjIdx: Map<cnpj, entryIndex>`
- `phoneIdx: Map<canonicalPhone, entryIndex>`

#### Fase 2 — Processamento por Aba (com flush incremental)
Para cada aba/arquivo, o loop percorre linha a linha:

1. Normaliza as chaves da linha (remove acentos, lower-case)
2. Extrai campos via `FIELD_MAP` — lista determinística de aliases por campo
3. **Normaliza telefones** (veja regra abaixo) e **concatena DDD** quando necessário
4. Determina correspondência por prioridade:
   - **CPF match** → mesclagem certa
   - **CNPJ match** → mesclagem certa
   - **Telefone + similaridade de nome ≥ 70%** → mesclagem
   - **Telefone + ambos sem nome** → mesclagem
   - **Sem match** → novo registro
5. A cada **500 novos registros acumulados** (`ROW_FLUSH_EVERY`), faz `flushNewEntries()`:
   - Insere no banco em lotes de **500 linhas** (`INSERT_BATCH`)
   - Libera a memória imediatamente via `splice(0)` no array pendente
   - Registra o `id` retornado em cada `entries[idx].id`

Ao final de cada aba, os registros pendentes restantes são flushed. Em seguida, os registros existentes marcados como `dirty` (enriquecidos pelo arquivo atual) recebem UPDATE em chunks de **20** (`UPDATE_CHUNK`) com `Promise.all` por chunk.

#### Fase 3 — Finalização
Atualiza `uploaded_files` com `status: "completed"`, contagens finais e emite o evento SSE `done`.

---

## Regras de Normalização de Telefone

Todos os campos mapeados como telefone (`phone`, `phone2`, `phone3`, `phone4`) e DDD (`ddd`) passam pela função `cleanNumber()` antes de serem gravados no banco. Essa função remove **tudo que não seja dígito (0–9)**:

| Valor original | Após normalização |
|---|---|
| `(62) 9991-4226` | `6299914226` |
| `62 9991.4226` | `629991 4226` → `629914226` |
| `ABC62 9991` | `629991` |
| `62-9991-4226a` | `6299914226` |

---

## Regra de Concatenação de DDD

Quando a planilha de entrada possui uma **coluna de DDD separada** (detectada pelo `FIELD_MAP.ddd`), o DDD é concatenado com os campos de telefone **antes de gravar no banco**, seguindo esta lógica:

- O DDD é extraído (apenas os 2 últimos dígitos numéricos, ex.: `"062"` → `"62"`)
- Para cada campo de telefone (`phone`, `phone2`, `phone3`, `phone4`):
  - Se o número já tem **10 ou mais dígitos**, considera que o DDD já está incluído — **não concatena**
  - Se o número tem **menos de 10 dígitos**, o DDD é prefixado: `ddd + número`

**Exemplos:**

| DDD | Número na planilha | Dígitos | Ação | Resultado gravado |
|---|---|---|---|---|
| `62` | `999142263` | 9 dígitos | Prefixar DDD | `62999142263` |
| `62` | `6299914226` | 10 dígitos | Já tem DDD | `6299914226` |
| `011` | `98765432` | 8 dígitos | Prefixar DDD (`11`) | `1198765432` |

---

## Filtros Granulares de Exportação

A página de exportação (`client/src/pages/Export.tsx`) oferece filtros individuais e independentes, aplicados em memória sobre os dados carregados (sem alterar o banco):

| Filtro | Comportamento padrão | Descrição |
|---|---|---|
| **Sem Engano** | Ativado | Exclui registros que contenham a palavra "engano" em qualquer campo |
| **Sem Falecido** | Ativado | Exclui registros que contenham a palavra "falecido" em qualquer campo |
| **Somente com Telefone** | Desativado | Exclui registros sem `phone` ou `phone2` preenchido |
| **Sem Telefones Duplicados** | Desativado | Mantém apenas o primeiro registro por número de telefone (deduplica em memória) |
| **CPF/CNPJ obrigatório** | Desativado | Exclui registros sem CPF nem CNPJ |
| **Endereço obrigatório** | Desativado | Exclui registros sem endereço |
| **Email obrigatório** | Desativado | Exclui registros sem email |
| **Outras palavras indesejadas** | Ativado | Exclui registros com: SEM GADO, XINGA, GRITA |
| **Filtros de texto** | Vazio | Filtros por Cidade, UF e Produto (texto livre) |

> Os filtros de deduplicação no banco (6 tipos: telefone, telefone+9, nome, CPF, CNPJ, combinado) são operações permanentes que movem registros para a lixeira. São diferentes dos filtros em memória da exportação.

---

## Script Python de Exportação Local (`script/exportar_leads.py`)

Script executável localmente para gerar uma planilha `.xlsx` diretamente do banco de dados, sem precisar da interface web.

**Pré-requisitos:** Python 3.8+, `pip install -r requirements.txt`

**Configuração:** arquivo `.env` na raiz com `DATABASE_URL=postgresql://...`

**Execução:** `python script/exportar_leads.py`

**Filtros aplicados automaticamente:**
1. **Sem Engano** — exclui registros com a palavra "engano"
2. **Sem Falecido** — exclui registros com a palavra "falecido"
3. **Somente com Telefone** — exclui registros sem telefone preenchido
4. **Sem duplicatas de telefone** — mantém apenas o primeiro registro por número
5. **Dígito 9 automático** — adiciona o 9 dígito em celulares com 8 dígitos locais

**Saída:** `exports/leads_YYYY-MM-DD_HH-MM-SS.xlsx`

Para instruções detalhadas, ver `GUIA_EXPORTACAO_LOCAL.md`.

---

## Controle de Memória

| Parâmetro | Valor | Objetivo |
|---|---|---|
| `--max-old-space-size` | 512 MB | Limita heap do Node — impede OOM em arquivos grandes |
| `INSERT_BATCH` | 500 linhas | Tamanho máximo de cada INSERT no banco |
| `ROW_FLUSH_EVERY` | 500 registros | Flush para o banco a cada N novos registros acumulados |
| `UPDATE_CHUNK` | 20 registros | Concorrência máxima de UPDATEs por lote |
| Pool pg `max` | 5 conexões | Evita esgotamento do Supabase |

**Por que o flush incremental resolve o OOM:**  
Antes, todos os novos registros de uma planilha eram acumulados em `sheetNewEntryIndices` e só inseridos no final. Para um CSV de 192 MB com 500 mil linhas, isso mantinha ~500 mil objetos em memória simultaneamente. Com o flush a cada 500 linhas, o pico de memória pendente é limitado a ~500 registros, independentemente do tamanho do arquivo.

---

## Autenticação

- `passport-local`: login por username + senha (bcrypt)
- Sessão server-side com `express-session` + `MemoryStore`
- Cookie HttpOnly, SameSite Lax, 7 dias de validade
- Roles: `admin` (acesso total) e `user` (acesso restrito)
- Bloqueio de conta via flag `blocked` na tabela `users`

---

## Deduplicação Pós-Import (`dedup.ts`)

Endpoint separado para limpeza da base consolidada após o import:
- `previewDedup`: retorna pares duplicados sem persistir (preview seguro)
- `runDedup`: aplica a deduplicação, mantendo o registro com mais campos preenchidos

Tipos de dedup disponíveis: por CPF, CNPJ, telefone canonicalizado, telefone+9 dígito, nome normalizado, combinado (telefone+nome).

---

## Análise de Colunas (`fileProcessor.ts`)

Usado pela página Analysis para mostrar o mapeamento de colunas detectadas automaticamente. Não faz parte do fluxo de processamento principal — é consultado separadamente para fins de visualização e auditoria.

---

## Progresso em Tempo Real (`progress.ts`)

`ProgressBus` é um `EventEmitter` interno. O endpoint SSE (`GET /api/progress/:fileId`) assina eventos por `fileId` e os entrega ao cliente como `text/event-stream`. Eventos: `start`, `sheet`, `row`, `batch`, `done`, `error`.

---

## Configuração de Build e Deploy

| Ambiente | Comando | Observação |
|---|---|---|
| Desenvolvimento | `npm run dev` | tsx ESM loader, Vite dev server embutido |
| Produção (build) | `npm run build` | esbuild via `script/build.ts` → `dist/index.cjs` |
| Produção (start) | `npm start` | Node puro sem tsx, heap limitado a 512 MB |
| Schema DB | `npm run db:push` | drizzle-kit push para Supabase |

O servidor Express escuta na porta `5000` (ou `$PORT`). Em produção, serve o build do frontend via `serveStatic`. Em desenvolvimento, o middleware Vite é injetado diretamente no servidor HTTP.

---

## Limitações Conhecidas e Decisões de Design

- **Buffer total em memória no upload**: Multer usa `memoryStorage`, portanto o arquivo inteiro fica em memória durante o upload. Para arquivos muito grandes (> 500 MB), isso pode ser um gargalo — alternativa futura: streaming via `busboy`.
- **existingRecords em memória**: A base consolidada inteira é carregada em memória para construir os índices de merge. Para bases muito grandes (> 1 M de registros), isso pode ser revisado para uso de índices no banco.
- **Fila serializada sem persistência**: Se o servidor reiniciar durante o processamento, a fila é perdida e o arquivo fica com status `pending` indefinidamente — pode ser resolvido com uma fila persistente (BullMQ/Redis).
