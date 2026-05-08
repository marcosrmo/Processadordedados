# Guia de Exportação Local — DataForge

Este guia explica como rodar o script `script/exportar_leads.py` localmente no VS Code para gerar uma planilha `.xlsx` com os leads filtrados diretamente do banco de dados.

---

## Pré-requisitos

- **Python 3.8 ou superior** — [python.org](https://www.python.org/downloads/)
- **pip** (geralmente já vem com o Python)
- Acesso ao banco PostgreSQL (string de conexão `DATABASE_URL`)

---

## 1. Instalar as dependências Python

Na raiz do projeto, execute:

```bash
pip install -r requirements.txt
```

Se ainda não existir o arquivo `requirements.txt`, instale manualmente:

```bash
pip install psycopg2-binary openpyxl python-dotenv
```

---

## 2. Configurar o arquivo `.env`

Crie (ou edite) o arquivo `.env` na **raiz do projeto** com o seguinte conteúdo:

```env
DATABASE_URL=postgresql://usuario:senha@host:porta/nome_do_banco
```

Exemplo real:

```env
DATABASE_URL=postgresql://admin:minhasenha@db.supabase.co:5432/postgres
```

> O script lê esse arquivo automaticamente. Nunca commite o `.env` no Git — ele já está no `.gitignore`.

---

## 3. Rodar o script no VS Code

Abra um terminal integrado no VS Code (`Ctrl+` `` ` ``) e execute:

```bash
python script/exportar_leads.py
```

Ou, se tiver múltiplas versões do Python:

```bash
python3 script/exportar_leads.py
```

---

## 4. O que cada filtro faz

O script aplica os seguintes filtros **automaticamente**, sem precisar configurar nada:

| Filtro | O que faz |
|---|---|
| **Sem Engano** | Exclui registros que contenham a palavra "engano" em qualquer campo |
| **Sem Falecido** | Exclui registros que contenham a palavra "falecido" em qualquer campo |
| **Somente com Telefone** | Exclui registros sem telefone ou celular preenchido |
| **Sem duplicatas de telefone** | Mantém apenas o primeiro registro encontrado por número de telefone |
| **Dígito 9 automático** | Adiciona o 9 dígito em celulares com 8 dígitos locais (ex: `62 9999-1234` → `62 99999-1234`) |

> Todos os outros filtros opcionais da interface web (cidade, UF, produto, etc.) **não são aplicados** pelo script — ele exporta todos os leads que passam pelos 4 filtros acima.

---

## 5. Exemplo de saída

Ao executar o script, você verá no terminal:

```
Conectando ao banco de dados...
Conexão estabelecida com sucesso.
Buscando registros...
Total de registros no banco (ativos): 45823

Resultado dos filtros:
  Removidos por ENGANO     : 124
  Removidos por FALECIDO   : 37
  Removidos SEM TELEFONE   : 8901
  Removidos DUPLICADOS     : 3412
  Registros finais         : 33349
  Dígito 9 adicionado em   : 6204 telefone(s)

Planilha gerada com sucesso:
  /caminho/para/exports/leads_2026-05-08_14-30-22.xlsx
  33349 registros exportados
```

A planilha é salva automaticamente na pasta `exports/` com data e hora no nome.

---

## 6. Colunas exportadas

A planilha gerada contém as seguintes colunas, na mesma ordem da interface web:

| Coluna | Campo |
|---|---|
| Telefone 1 | `phone` |
| Telefone 2 | `phone2` |
| Telefone 3 | `phone3` |
| Telefone 4 | `phone4` |
| DDD | `ddd` |
| Nome | `name` |
| CPF | `cpf` |
| CNPJ | `cnpj` |
| Email | `email` |
| Logradouro | `address` |
| Número | `number` |
| Complemento | `complement` |
| Bairro | `neighborhood` |
| Cidade | `city` |
| UF | `state` |
| CEP | `cep` |
| Dt. Últ. Compra | `purchase_date` |
| Produto | `produto` |
| Quantidade | `quantidade` |
| Ticket Médio | `ticket_average` |

---

## Solução de problemas

**`ModuleNotFoundError: No module named 'psycopg2'`**
→ Execute: `pip install psycopg2-binary`

**`ModuleNotFoundError: No module named 'openpyxl'`**
→ Execute: `pip install openpyxl`

**`ERRO: variável DATABASE_URL não definida`**
→ Verifique se o arquivo `.env` existe na raiz do projeto e contém `DATABASE_URL=...`

**`ERRO ao conectar ao banco`**
→ Verifique se a `DATABASE_URL` está correta e se o banco está acessível (teste de conexão no DBeaver, psql, etc.)

**Planilha gerada mas vazia (0 registros)**
→ Todos os registros foram filtrados. Verifique se há registros ativos no banco (sem `deleted_at`).
