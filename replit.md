# Processador de Dados

Plataforma web para consolidação, mesclagem inteligente e deduplicação de dados de múltiplas planilhas (Excel, CSV UTF-8, TXT).

## Run & Operate

```bash
npm run dev        # desenvolvimento (tsx/esm, porta 5000)
npm run build      # build produção (esbuild → dist/)
npm start          # produção
npm run db:push    # aplica migrações Drizzle → PostgreSQL
```

Variáveis de ambiente obrigatórias:
- `DATABASE_URL` — string de conexão PostgreSQL

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 + Radix UI + TanStack Query + Wouter
- **Backend**: Node.js + Express 4
- **Banco**: PostgreSQL 16 + Drizzle ORM
- **Parsing**: SheetJS (Excel), csv-parse + PapaParse (CSV/TXT)
- **Tempo real**: Server-Sent Events (SSE) para progresso de upload
- **Auth**: Passport.js Local Strategy

## Where things live

- `server/storage.ts` — Lógica de merge, FIELD_MAP, processFile (coração do sistema)
- `server/dedup.ts` — Algoritmos de deduplicação (6 tipos)
- `server/routes.ts` — API REST + SSE endpoints
- `shared/schema.ts` — Schema Drizzle + tipos Zod (fonte da verdade)
- `client/src/pages/` — Import, Consolidation (com lixeira), Export, Dashboard
- `arquitetura_do_processador.md` — Documentação completa da arquitetura

## Architecture decisions

- **Soft-delete**: registros "removidos" têm `deleted_at` preenchido; restauração limpa esse campo. Hard-delete só na lixeira.
- **Processamento background + SSE**: upload retorna 202 imediatamente; processamento pesado em background com fallback polling a cada 4s.
- **Merge em memória por aba**: carrega base em RAM com índices hash; persiste ao banco a cada aba (não acumula tudo), garantindo não perder progresso em falhas parciais.
- **FIELD_MAP determinístico**: sem amostragem aleatória — mapa de aliases exato define qual coluna vai para qual campo.
- **Telefone canônico**: celulares BR 11→10 dígitos para merge cross-base sem duplicatas pelo 9º dígito.

## Product

- Importa XLSX, XLS, ODS, CSV UTF-8 (vírgula/ponto-e-vírgula/pipe/TAB), TXT — até 1 GB/arquivo, 2.000 arquivos
- Consolida planilhas em ordem (uma após a outra), mesclando registros por CPF > CNPJ > Telefone+Nome
- Deduplicação com 6 critérios: Telefone, Telefone+9, Nome, CPF, CNPJ, Combinado
- Lixeira com soft-delete + restauração + esvaziar
- Exportação CSV UTF-8 e Excel com filtros e seleção de colunas
- Progresso em tempo real via SSE com fallback polling

## Gotchas

- Drizzle não cria migrações automáticas — sempre rodar `npm run db:push` após alterar `shared/schema.ts`
- O campo `email` e `deleted_at` foram adicionados na v2; se o banco não tiver as colunas, rodar `db:push`
- `multer.memoryStorage()` — arquivos ficam em RAM durante processamento; sem arquivos temporários em disco
- Soft-delete filtra `deleted_at IS NULL` em TODAS as queries de leitura do banco
