# Guia de Exportação Local — DataForge

Use o script `exportar_leads.py` para processar suas planilhas **diretamente no seu computador**, sem precisar de banco de dados nem de conexão com a internet.

---

## O que o script faz

1. Lê todos os arquivos da pasta `input/` (CSV, XLSX, XLS, TXT)
2. Detecta automaticamente os campos de cada planilha (telefone, nome, CPF, cidade, etc.)
3. Normaliza os números de telefone (remove pontos, traços, parênteses)
4. Concatena o DDD ao número quando estiver em coluna separada
5. Mescla registros duplicados entre arquivos (por CPF, CNPJ ou telefone+nome)
6. Remove registros com a palavra "engano" ou "falecido"
7. Remove registros sem telefone
8. Remove telefones duplicados
9. Adiciona o 9º dígito em celulares com 8 dígitos locais
10. Gera uma planilha `.xlsx` com data e hora no nome, dentro de `exports/`

---

## Instalação (apenas na primeira vez)

### Pré-requisito: Python 3.8 ou superior

Verifique com:
```bash
python --version
# ou
python3 --version
```

### Instalar as dependências

No terminal, dentro da pasta do projeto:

```bash
pip install -r requirements.txt
```

As bibliotecas instaladas são:
- `pandas` — leitura de tabelas
- `openpyxl` — ler/escrever arquivos XLSX
- `xlrd` — ler arquivos XLS antigos
- `chardet` — detectar encoding de arquivos CSV

---

## Como usar

### 1. Coloque seus arquivos na pasta `input/`

Formatos aceitos:

| Extensão | Descrição |
|----------|-----------|
| `.csv`   | CSV separado por `,`, `;`, `\|` ou tabulação |
| `.txt`   | TXT com colunas separadas por `;` ou `,` |
| `.xlsx`  | Excel moderno |
| `.xls`   | Excel antigo (97-2003) |

Você pode colocar **vários arquivos** ao mesmo tempo — o script lê todos e mescla os registros.

### 2. Execute o script

```bash
# Windows
python script\exportar_leads.py

# Linux / Mac
python3 script/exportar_leads.py
```

### 3. Abra a planilha gerada

O resultado fica em `exports/` com o nome no formato:
```
leads_2026-05-08_15-23-30.xlsx
```

---

## Campos reconhecidos automaticamente

O script detecta os campos pelo **nome do cabeçalho** da planilha. Funciona com qualquer das variações abaixo:

| Campo exportado    | Exemplos de nome de coluna aceitos |
|--------------------|------------------------------------|
| Telefone 1         | Telefone, Tel, Fone, Telefone do Cliente, Nr Telefone, Telefone Comercial |
| Telefone 2         | Celular, Cel, WhatsApp, Zap, Tel 2, Celular1 |
| Telefone 3         | Tel 3, Celular3, Fone3 |
| Telefone 4         | Tel 4, Celular4, Fone4 |
| DDD                | DDD, DD, Cód. Área, Prefixo |
| Nome               | Nome, Nome do Cliente, Cliente, Razão Social |
| CPF                | CPF, CPF do Cliente |
| CNPJ               | CNPJ, CGC |
| CPF/CNPJ (misto)   | CPF/CNPJ, Documento, Doc |
| Email              | Email, E-mail, Mail |
| Logradouro         | Endereço, Rua, Avenida, Logradouro |
| Cidade             | Cidade, Município, Localidade |
| UF                 | UF, Estado, Sigla |
| CEP                | CEP, ZIP |
| Ticket Médio       | Faturamento, Valor, Maior Compra, Ticket Médio |
| Dt. Últ. Compra    | Data, Data Compra, Data Venda, Dt. Ult. Compra |
| Produto            | Produto, Mercadoria, Item, Descrição |
| Quantidade         | Quantidade, Qtd, Qty |

> **Dica:** O script ignora maiúsculas, acentos e espaços extras nos nomes das colunas.  
> `"TELEFONE DO CLIENTE"`, `"Telefone do cliente"` e `"telefone_do_cliente"` são tratados da mesma forma.

---

## Filtros aplicados

| Filtro | O que faz |
|--------|-----------|
| Sem Engano | Remove linhas que contenham a palavra "engano" em qualquer campo |
| Sem Falecido | Remove linhas que contenham a palavra "falecido" em qualquer campo |
| Somente com Telefone | Remove registros sem nenhum número de telefone preenchido |
| Sem Duplicatas | Mantém apenas um registro por número de telefone |
| Dígito 9 | Adiciona o 9 em celulares com 10 dígitos (DDD + 8 dígitos locais iniciados em 6–9) |

---

## Exemplo de saída no terminal

```
============================================================
  DataForge — Exportação Local de Leads
============================================================

Pasta de entrada : /home/user/dataforge/input
Pasta de saída   : /home/user/dataforge/exports

Arquivos encontrados: 2
  - clientes_jan.csv
  - base_sul.xlsx

Lendo: clientes_jan.csv
  Linhas lidas      : 5000
  Registros válidos : 5000

Lendo: base_sul.xlsx
  Linhas lidas      : 3756
  Registros válidos : 3756

Total lido de todos os arquivos: 8756 registros

Mesclando registros duplicados entre arquivos...
  Após merge: 8512 registros únicos (244 mesclados)

Aplicando filtros:
  Removidos por ENGANO        : 0
  Removidos por FALECIDO      : 7
  Removidos SEM TELEFONE      : 0
  Removidos DUPLICADOS        : 12
  Registros finais: 8493
  Dígito 9 adicionado em: 9 telefone(s)

Gerando planilha...

============================================================
  Planilha gerada com sucesso!
  Arquivo : leads_2026-05-08_15-23-30.xlsx
  Local   : /home/user/dataforge/exports/leads_2026-05-08_15-23-30.xlsx
  Total   : 8493 registros
============================================================
```

---

## Estrutura de pastas

```
dataforge/
├── input/              ← Coloque seus arquivos aqui
│   ├── clientes.csv
│   └── base_sul.xlsx
├── exports/            ← Planilhas geradas ficam aqui
│   └── leads_2026-05-08_15-23-30.xlsx
├── script/
│   └── exportar_leads.py
└── requirements.txt
```

---

## Dúvidas frequentes

**O script pode ler vários arquivos ao mesmo tempo?**  
Sim. Coloque quantos arquivos quiser na pasta `input/` — todos serão lidos, mesclados e filtrados juntos.

**E se minha planilha tiver nomes de colunas diferentes dos listados?**  
Renomeie a coluna para um dos nomes aceitos (veja a tabela acima). O script não exige formato exato, mas a coluna precisa conter ao menos uma das palavras-chave reconhecidas.

**O arquivo de entrada é apagado após o processamento?**  
Não. O script apenas lê os arquivos de `input/` e grava o resultado em `exports/`. Seus arquivos originais não são modificados.

**Posso usar no Windows?**  
Sim, funciona em Windows, Linux e Mac. No Windows use `python` em vez de `python3`.
