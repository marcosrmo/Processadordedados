#!/usr/bin/env python3
"""
exportar_leads.py — Exportação local de leads do DataForge

Filtros aplicados automaticamente:
  - Sem Engano   : exclui registros com a palavra "engano" em qualquer campo
  - Sem Falecido : exclui registros com a palavra "falecido" em qualquer campo
  - Somente com Telefone : exclui registros sem telefone preenchido
  - Sem duplicatas de telefone : mantém apenas o primeiro registro por número
  - Adiciona dígito 9 em celulares com 8 dígitos locais (ex: DDD + 8 → DDD + 9 + 8)

Uso:
  python script/exportar_leads.py

Saída:
  exports/leads_YYYY-MM-DD_HH-MM-SS.xlsx
"""

import os
import sys
import re
from datetime import datetime

# ── Dependências ──────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
except ImportError:
    print("ERRO: python-dotenv não instalado. Execute: pip install python-dotenv")
    sys.exit(1)

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERRO: psycopg2 não instalado. Execute: pip install psycopg2-binary")
    sys.exit(1)

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment
except ImportError:
    print("ERRO: openpyxl não instalado. Execute: pip install openpyxl")
    sys.exit(1)


# ── Carregar .env ─────────────────────────────────────────────────────────────
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT_DIR, ".env")

if not os.path.exists(ENV_PATH):
    print(f"AVISO: arquivo .env não encontrado em {ENV_PATH}")
    print("Tentando usar DATABASE_URL do ambiente do sistema...")
else:
    load_dotenv(ENV_PATH)

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERRO: variável DATABASE_URL não definida.")
    print("Crie um arquivo .env na raiz do projeto com:")
    print("  DATABASE_URL=postgresql://usuario:senha@host:porta/banco")
    sys.exit(1)


# ── Conexão com o banco ───────────────────────────────────────────────────────
print("Conectando ao banco de dados...")
try:
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.DictCursor)
    conn.set_session(readonly=True, autocommit=True)
    cursor = conn.cursor()
    cursor.execute("SELECT 1")
    print("Conexão estabelecida com sucesso.")
except Exception as e:
    print(f"ERRO ao conectar ao banco: {e}")
    sys.exit(1)


# ── Buscar registros ativos ───────────────────────────────────────────────────
print("Buscando registros...")
cursor.execute("""
    SELECT
        id, name, cpf, cnpj,
        phone, phone2, phone3, phone4, ddd,
        email, address, number, complement,
        neighborhood, city, state, cep,
        ticket_average, purchase_date, produto, quantidade,
        status, confidence, source_files, created_at
    FROM consolidated_records
    WHERE deleted_at IS NULL
    ORDER BY created_at
""")
rows = cursor.fetchall()
cursor.close()
conn.close()

print(f"Total de registros no banco (ativos): {len(rows)}")


# ── Helpers ───────────────────────────────────────────────────────────────────

def only_digits(value):
    """Remove tudo que não seja dígito."""
    if not value:
        return ""
    return re.sub(r"\D", "", str(value))


def add_nine_digit(phone_digits):
    """
    Adiciona o 9 dígito em celulares brasileiros com 8 dígitos locais.
    Exemplo: DDD(2) + número(8) = 10 dígitos → DDD + 9 + número = 11 dígitos
    Só adiciona o 9 se o primeiro dígito do número local for 6, 7, 8 ou 9.
    """
    if len(phone_digits) != 10:
        return phone_digits
    ddd = phone_digits[:2]
    local = phone_digits[2:]
    if local and local[0] in "6789":
        return ddd + "9" + local
    return phone_digits


def row_text(row):
    """Junta todos os campos de uma linha em texto para busca de palavras."""
    parts = []
    for col in ["name", "phone", "phone2", "phone3", "phone4", "email",
                "address", "neighborhood", "city", "state", "produto"]:
        v = row[col]
        if v:
            parts.append(str(v).lower())
    return " ".join(parts)


# ── Filtros ───────────────────────────────────────────────────────────────────

total_original = len(rows)
filtered = []
seen_phones = set()

engano_re   = re.compile(r'\bengano\b')
falecido_re = re.compile(r'\bfalecido\b')

count_engano    = 0
count_falecido  = 0
count_sem_tel   = 0
count_dup       = 0

for row in rows:
    text = row_text(row)

    # Filtro: Sem Engano
    if engano_re.search(text):
        count_engano += 1
        continue

    # Filtro: Sem Falecido
    if falecido_re.search(text):
        count_falecido += 1
        continue

    # Filtro: Somente com Telefone
    phone_digits = only_digits(row["phone"] or row["phone2"])
    if not phone_digits:
        count_sem_tel += 1
        continue

    # Normaliza o telefone principal para deduplicação
    normalized = add_nine_digit(phone_digits)

    # Filtro: Sem duplicatas de telefone
    if normalized in seen_phones:
        count_dup += 1
        continue
    seen_phones.add(normalized)

    filtered.append(dict(row))


print(f"\nResultado dos filtros:")
print(f"  Removidos por ENGANO     : {count_engano}")
print(f"  Removidos por FALECIDO   : {count_falecido}")
print(f"  Removidos SEM TELEFONE   : {count_sem_tel}")
print(f"  Removidos DUPLICADOS     : {count_dup}")
print(f"  Registros finais         : {len(filtered)}")


# ── Adicionar 9 dígito nos celulares ─────────────────────────────────────────

count_nine_added = 0
for rec in filtered:
    for field in ["phone", "phone2", "phone3", "phone4"]:
        val = only_digits(rec.get(field) or "")
        if len(val) == 10:
            new_val = add_nine_digit(val)
            if new_val != val:
                rec[field] = new_val
                count_nine_added += 1

print(f"  Dígito 9 adicionado em   : {count_nine_added} telefone(s)")


# ── Gerar planilha XLSX ───────────────────────────────────────────────────────

EXPORTS_DIR = os.path.join(ROOT_DIR, "exports")
os.makedirs(EXPORTS_DIR, exist_ok=True)

timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
output_file = os.path.join(EXPORTS_DIR, f"leads_{timestamp}.xlsx")

COLUMNS = [
    ("phone",         "Telefone 1"),
    ("phone2",        "Telefone 2"),
    ("phone3",        "Telefone 3"),
    ("phone4",        "Telefone 4"),
    ("ddd",           "DDD"),
    ("name",          "Nome"),
    ("cpf",           "CPF"),
    ("cnpj",          "CNPJ"),
    ("email",         "Email"),
    ("address",       "Logradouro"),
    ("number",        "Número"),
    ("complement",    "Complemento"),
    ("neighborhood",  "Bairro"),
    ("city",          "Cidade"),
    ("state",         "UF"),
    ("cep",           "CEP"),
    ("purchase_date", "Dt. Últ. Compra"),
    ("produto",       "Produto"),
    ("quantidade",    "Quantidade"),
    ("ticket_average","Ticket Médio"),
]

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Leads"

# Cabeçalho
header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
header_font = Font(color="FFFFFF", bold=True, size=10)

for col_idx, (_, label) in enumerate(COLUMNS, start=1):
    cell = ws.cell(row=1, column=col_idx, value=label)
    cell.fill = header_fill
    cell.font = header_font
    cell.alignment = Alignment(horizontal="center", vertical="center")

# Dados
for row_idx, rec in enumerate(filtered, start=2):
    for col_idx, (field, _) in enumerate(COLUMNS, start=1):
        value = rec.get(field)
        if value is not None:
            ws.cell(row=row_idx, column=col_idx, value=str(value))

# Ajustar largura das colunas
for col_idx, (_, label) in enumerate(COLUMNS, start=1):
    col_letter = openpyxl.utils.get_column_letter(col_idx)
    ws.column_dimensions[col_letter].width = max(len(label) + 4, 14)

# Congelar cabeçalho
ws.freeze_panes = "A2"

wb.save(output_file)

print(f"\nPlanilha gerada com sucesso:")
print(f"  {output_file}")
print(f"  {len(filtered)} registros exportados")
