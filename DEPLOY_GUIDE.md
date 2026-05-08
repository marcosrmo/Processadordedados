# Guia Completo de Deploy - Render + Supabase

Este guia explica passo a passo como hospedar sua aplicacao no Render (backend) e Supabase (banco de dados PostgreSQL).

---

## Parte 1: Configurar Supabase (Banco de Dados)

### 1.1 Criar Conta no Supabase
1. Acesse [https://supabase.com](https://supabase.com)
2. Clique em "Start your project"
3. Faca login com GitHub ou email

### 1.2 Criar Novo Projeto
1. Clique em "New Project"
2. Escolha um nome para o projeto
3. Defina uma senha forte para o banco de dados (GUARDE ESSA SENHA!)
4. Selecione a regiao mais proxima (ex: South America - Sao Paulo)
5. Clique em "Create new project"
6. Aguarde 2-3 minutos para o projeto ser criado

### 1.3 Obter Connection String
1. No menu lateral, clique em "Project Settings" (icone de engrenagem)
2. Clique em "Database"
3. Role ate a secao "Connection string"
4. Selecione "URI" e copie a connection string
5. A string tera este formato:
   ```
   postgresql://postgres.[seu-projeto]:[sua-senha]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   ```

### 1.4 Configuracoes Importantes do Supabase
1. Va em "Project Settings" > "Database"
2. Em "Connection Pooling", certifique-se de que esta habilitado
3. Use a porta `6543` para conexoes com pooling (recomendado)
4. Use a porta `5432` para conexoes diretas

### 1.5 Executar Migracoes
Antes de fazer deploy, execute as migracoes do banco de dados localmente:

```bash
# Defina a variavel de ambiente com a connection string do Supabase
export DATABASE_URL="postgresql://postgres.[seu-projeto]:[sua-senha]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require"

# Execute as migracoes
npm run db:push
```

---

## Parte 2: Configurar Render (Hospedagem)

### 2.1 Criar Conta no Render
1. Acesse [https://render.com](https://render.com)
2. Clique em "Get Started for Free"
3. Faca login com GitHub (recomendado para facilitar o deploy)

### 2.2 Preparar o Repositorio
Certifique-se de que seu codigo esta em um repositorio Git (GitHub, GitLab ou Bitbucket).

### 2.3 Criar Web Service
1. No dashboard do Render, clique em "New +"
2. Selecione "Web Service"
3. Conecte seu repositorio GitHub/GitLab
4. Selecione o repositorio do seu projeto

### 2.4 Configurar o Web Service
Preencha as configuracoes:

| Campo | Valor |
|-------|-------|
| **Name** | nome-do-seu-app |
| **Region** | South America (Sao Paulo) |
| **Branch** | main (ou sua branch principal) |
| **Runtime** | Node |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run start` |
| **Instance Type** | Free (ou pago conforme necessidade) |

### 2.5 Configurar Variaveis de Ambiente
Na secao "Environment Variables", adicione:

| Chave | Valor |
|-------|-------|
| `DATABASE_URL` | Sua connection string do Supabase (com `?sslmode=require` no final) |
| `NODE_ENV` | `production` |

**NOTA:** O Render injeta automaticamente a variavel `PORT`. NAO defina manualmente.

**IMPORTANTE:** A DATABASE_URL deve ter `?sslmode=require` no final:
```
postgresql://postgres.[seu-projeto]:[sua-senha]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require
```

### 2.6 Deploy
1. Clique em "Create Web Service"
2. O Render ira automaticamente:
   - Clonar seu repositorio
   - Executar `npm install && npm run build`
   - Iniciar com `npm run start`
3. Aguarde o deploy (3-5 minutos na primeira vez)
4. Sua aplicacao estara disponivel em: `https://nome-do-seu-app.onrender.com`

---

## Parte 3: Solucao de Problemas

### 3.1 Erro de Conexao com Banco de Dados
Este projeto ja esta configurado para forcar conexoes IPv4, que e necessario para o Render funcionar corretamente com o Supabase.

Se ainda tiver problemas:
1. Verifique se a DATABASE_URL esta correta
2. Certifique-se de incluir `?sslmode=require`
3. Use a porta `6543` (pooler) ao inves de `5432`

### 3.2 Timeout na Conexao
O projeto ja inclui configuracoes de timeout:
- `connectionTimeoutMillis: 10000` (10 segundos)
- `idleTimeoutMillis: 30000` (30 segundos)

### 3.3 Erro "IPv6 not supported"
Este projeto forca conexoes IPv4 de duas formas:
1. `dns.setDefaultResultOrder('ipv4first')` - Define preferencia IPv4
2. Override de `dns.lookup` com `family: 4` - Garante que TODAS as resolucoes DNS usem IPv4

Isso resolve o problema comum do Render nao conseguir conectar via IPv6 ao Supabase.

### 3.4 Logs do Render
Para ver logs da aplicacao:
1. Va ao dashboard do Render
2. Clique no seu Web Service
3. Clique na aba "Logs"

---

## Parte 4: Checklist Pre-Deploy

- [ ] Conta Supabase criada
- [ ] Projeto Supabase criado
- [ ] Connection string copiada (com sslmode=require)
- [ ] Migracoes executadas (`npm run db:push`)
- [ ] Conta Render criada
- [ ] Repositorio conectado ao Render
- [ ] Variaveis de ambiente configuradas
- [ ] Build Command: `npm install && npm run build`
- [ ] Start Command: `npm run start`

---

## Parte 5: Atualizacoes Futuras

Para atualizar sua aplicacao:
1. Faca push das alteracoes para o GitHub
2. O Render automaticamente detecta e faz redeploy
3. Para deploy manual: va ao dashboard > "Manual Deploy" > "Deploy latest commit"

---

## Comandos Uteis

```bash
# Desenvolvimento local
npm run dev

# Build para producao
npm run build

# Iniciar em producao
npm run start

# Executar migracoes
npm run db:push
```

---

## Suporte

- **Render Docs:** https://render.com/docs
- **Supabase Docs:** https://supabase.com/docs
- **Problemas com IPv4:** O codigo ja esta configurado para forcar IPv4 automaticamente
