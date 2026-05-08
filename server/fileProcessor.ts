import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { storage } from './storage';
import type { InsertSheetMetadata, InsertColumnMapping } from '@shared/schema';

interface ParsedSheet {
  name: string;
  index: number;
  data: any[][];
  columns: string[];
  rowCount: number;
  columnCount: number;
}

function normalizeStr(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}


const KNOWN_FIELD_TERMS = new Set([
  "nome","cpf","cnpj","telefone","tel","fone","celular","email","endereco",
  "logradouro","cidade","estado","uf","cep","bairro","rua","numero","complemento",
  "phone","mobile","name","address","city","state","zip","email","document",
  "whatsapp","wpp","contato","cliente","comprador","produto","valor","data",
  "ticket","quantidade","nascimento","sexo","cargo","cnpj","cpf","cnpj",
  "cel","movel","zap","fax","ramal","ddd","fixo","residencial",
]);

function scoreHeaderRow(row: any[]): number {
  let score = 0;
  for (const cell of row) {
    if (!cell) continue;
    const norm = cell.toString().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "").trim();
    const words = norm.split(/\s+/);
    for (const word of words) {
      if (KNOWN_FIELD_TERMS.has(word)) { score += 2; break; }
      for (const term of KNOWN_FIELD_TERMS) {
        if (norm.includes(term) || term.includes(word)) { score += 1; break; }
      }
    }
  }
  return score;
}

function detectHeaderRow(data: any[][]): { headerIndex: number; columns: string[]; dataRows: any[][] } {
  if (data.length === 0) return { headerIndex: 0, columns: [], dataRows: [] };

  const score0 = scoreHeaderRow(data[0] || []);
  const score1 = data.length > 1 ? scoreHeaderRow(data[1] || []) : -1;

  // Se a linha 2 pontua melhor que a linha 1 → header na linha 2
  const headerIndex = (score1 > score0 && score1 > 0) ? 1 : 0;
  const columns = (data[headerIndex] || []).map((col: any, i: number) => col?.toString() || `Column_${i + 1}`);
  const dataRows = data.slice(headerIndex + 1);

  return { headerIndex, columns, dataRows };
}

const FIELD_PATTERNS: Record<string, {
  exactMatch?: string[];
  regex?: RegExp;
  fuzzyTerms?: string[];
  displayName: string;
}> = {

  // ── PESSOA / IDENTIFICAÇÃO ──────────────────────────────────────────────
  nome: {
    displayName: 'Nome',
    exactMatch: ['nome', 'nomecompleto', 'name', 'cliente', 'comprador', 'proprietario',
      'segurado', 'paciente', 'funcionario', 'colaborador', 'consumidor', 'pessoa',
      'razao social', 'nome cliente', 'nome do cliente', 'nome completo'],
    fuzzyTerms: ['nome', 'name', 'client'],
  },
  vendedor: {
    displayName: 'Vendedor',
    exactMatch: ['vendedor', 'vendedora', 'consultor', 'consultant'],
  },
  responsavel: {
    displayName: 'Responsável',
    exactMatch: ['responsavel', 'responsible', 'resp'],
  },
  titular: {
    displayName: 'Titular',
    exactMatch: ['titular'],
  },
  socio: {
    displayName: 'Sócio',
    exactMatch: ['socio', 'socia', 'partner'],
  },
  representante: {
    displayName: 'Representante',
    exactMatch: ['representante', 'representative', 'rep'],
  },
  diretor: {
    displayName: 'Diretor',
    exactMatch: ['diretor', 'diretora', 'director'],
  },

  // ── DADOS PESSOAIS ──────────────────────────────────────────────────────
  nascimento: {
    displayName: 'Nascimento',
    exactMatch: ['nascimento', 'dtnasc', 'datanasc', 'data nascimento', 'data de nascimento',
      'dtnascimento', 'dt_nasc', 'nasc', 'birthday', 'birthdate'],
    regex: /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
  },
  naturalidade: {
    displayName: 'Naturalidade',
    exactMatch: ['naturalidade', 'natural'],
  },
  nacionalidade: {
    displayName: 'Nacionalidade',
    exactMatch: ['nacionalidade', 'nationality'],
  },
  sexo: {
    displayName: 'Sexo',
    exactMatch: ['sexo', 'genero', 'gender', 'sex'],
  },
  estadocivil: {
    displayName: 'Estado Civil',
    exactMatch: ['estadocivil', 'estado civil', 'civil', 'marital'],
  },
  profissao: {
    displayName: 'Profissão',
    exactMatch: ['profissao', 'ocupacao', 'profession', 'occupation', 'prof'],
  },
  cargo: {
    displayName: 'Cargo',
    exactMatch: ['cargo', 'funcao', 'role', 'position', 'job'],
  },

  // ── CONTATO / TELEFONE ──────────────────────────────────────────────────
  telefone: {
    displayName: 'Telefone',
    exactMatch: ['telefone', 'tel', 'fone', 'phone', 'ramal', 'telefoneresidencial',
      'telresidencial', 'foneresidencial', 'phoneresidential'],
    regex: /^(\(?\d{2}\)?\s?)?\d{4}-?\d{4}$/,
  },
  celular: {
    displayName: 'Celular',
    exactMatch: ['celular', 'cel', 'movel', 'mobile', 'telefonecelular', 'telcel',
      'fonecelular', 'telefonemovel', 'fonemovel', 'celulartel', 'whatsapp', 'wpp'],
    regex: /^(\(?\d{2}\)?\s?)?9\d{4}-?\d{4}$/,
  },
  whatsapp: {
    displayName: 'WhatsApp',
    exactMatch: ['whatsapp', 'wpp', 'zap'],
  },
  ramal: {
    displayName: 'Ramal',
    exactMatch: ['ramal', 'extension'],
  },
  fax: {
    displayName: 'Fax',
    exactMatch: ['fax'],
  },
  contato: {
    displayName: 'Contato',
    exactMatch: ['contato', 'contact', 'contacts'],
  },
  email: {
    displayName: 'Email',
    exactMatch: ['email', 'e-mail', 'mail', 'correio', 'emailaddress', 'email address'],
    regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  site: {
    displayName: 'Site',
    exactMatch: ['site', 'website', 'url', 'homepage', 'web'],
  },

  // ── DOCUMENTOS ──────────────────────────────────────────────────────────
  cpf: {
    displayName: 'CPF',
    exactMatch: ['cpf', 'cpf_cliente', 'cpfcliente', 'cpf cliente', 'cpf do cliente'],
    regex: /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/,
  },
  cnpj: {
    displayName: 'CNPJ',
    exactMatch: ['cnpj', 'cnpj empresa', 'cnpjempresa'],
    regex: /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/,
  },
  rg: {
    displayName: 'RG',
    exactMatch: ['rg', 'identidade', 'registro geral', 'registrogeral'],
  },
  cnh: {
    displayName: 'CNH',
    exactMatch: ['cnh', 'habilitacao', 'carteira motorista', 'carteiramotorista'],
  },
  ctps: {
    displayName: 'CTPS',
    exactMatch: ['ctps', 'carteira trabalho', 'carteiradotrabalho'],
  },
  pis: {
    displayName: 'PIS',
    exactMatch: ['pis', 'pasep', 'pis pasep', 'pispasep'],
  },
  nit: {
    displayName: 'NIT',
    exactMatch: ['nit'],
  },
  matricula: {
    displayName: 'Matrícula',
    exactMatch: ['matricula', 'matr', 'registration'],
  },
  documento: {
    displayName: 'Documento',
    exactMatch: ['documento', 'doc', 'document'],
  },
  passaporte: {
    displayName: 'Passaporte',
    exactMatch: ['passaporte', 'passport'],
  },
  tituloeleitor: {
    displayName: 'Título Eleitor',
    exactMatch: ['titulo', 'tituloeleitor', 'titulo eleitor'],
  },

  // ── EMPRESA / NEGÓCIO ───────────────────────────────────────────────────
  empresa: {
    displayName: 'Empresa',
    exactMatch: ['empresa', 'company', 'organization', 'organizacao'],
  },
  razaosocial: {
    displayName: 'Razão Social',
    exactMatch: ['razaosocial', 'razao social', 'razão social', 'corporate name'],
  },
  nomefantasia: {
    displayName: 'Nome Fantasia',
    exactMatch: ['nomefantasia', 'nome fantasia', 'fantasia', 'trade name', 'tradename'],
  },
  fornecedor: {
    displayName: 'Fornecedor',
    exactMatch: ['fornecedor', 'supplier', 'vendor'],
  },
  fabricante: {
    displayName: 'Fabricante',
    exactMatch: ['fabricante', 'manufacturer'],
  },
  transportadora: {
    displayName: 'Transportadora',
    exactMatch: ['transportadora', 'carrier', 'shipping'],
  },
  parceiro: {
    displayName: 'Parceiro',
    exactMatch: ['parceiro', 'partner'],
  },
  ie: {
    displayName: 'IE',
    exactMatch: ['ie', 'inscricaoestadual', 'inscricao estadual', 'inscestadual', 'insc estadual',
      'inscricao_estadual', 'ie_empresa'],
  },
  im: {
    displayName: 'IM',
    exactMatch: ['im', 'inscricaomunicipal', 'inscricao municipal', 'inscmunicipal'],
  },

  // ── DATAS / TEMPO ───────────────────────────────────────────────────────
  data: {
    displayName: 'Data',
    exactMatch: ['data', 'date', 'dt', 'dia', 'data_registro', 'datacompra', 'data compra',
      'data venda', 'datavenda'],
    regex: /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
  },
  dataemissao: {
    displayName: 'Data Emissão',
    exactMatch: ['dataemissao', 'data emissao', 'dataemit', 'emissao', 'emission date'],
  },
  dataentrega: {
    displayName: 'Data Entrega',
    exactMatch: ['dataentrega', 'data entrega', 'delivery date', 'deliverydate'],
  },
  vencimento: {
    displayName: 'Vencimento',
    exactMatch: ['vencimento', 'venc', 'due date', 'duedate', 'expiry'],
  },
  validade: {
    displayName: 'Validade',
    exactMatch: ['validade', 'validity', 'expiration'],
  },
  prazo: {
    displayName: 'Prazo',
    exactMatch: ['prazo', 'deadline', 'term'],
  },
  entrega: {
    displayName: 'Entrega',
    exactMatch: ['entrega', 'delivery'],
  },
  hora: {
    displayName: 'Hora',
    exactMatch: ['hora', 'horario', 'time', 'hour'],
    regex: /^\d{1,2}:\d{2}(:\d{2})?$/,
  },

  // ── ENDEREÇO ────────────────────────────────────────────────────────────
  endereco: {
    displayName: 'Endereço',
    exactMatch: ['endereco', 'logradouro', 'address', 'rua', 'r.', 'avenida', 'av', 'av.',
      'alameda', 'travessa', 'estrada', 'rodovia', 'end', 'logr'],
  },
  numero: {
    displayName: 'Número',
    exactMatch: ['numero', 'nro', 'num', 'n', 'number', 'no'],
  },
  complemento: {
    displayName: 'Complemento',
    exactMatch: ['complemento', 'compl', 'apto', 'apartamento', 'casa', 'bloco', 'sala',
      'complement', 'apt'],
  },
  bairro: {
    displayName: 'Bairro',
    exactMatch: ['bairro', 'district', 'neighborhood', 'bairrocidade'],
  },
  distrito: {
    displayName: 'Distrito',
    exactMatch: ['distrito'],
  },
  setor: {
    displayName: 'Setor',
    exactMatch: ['setor', 'sector'],
  },
  cidade: {
    displayName: 'Cidade',
    exactMatch: ['cidade', 'municipio', 'localidade', 'city', 'municipio_uf', 'cidade_uf'],
  },
  estado: {
    displayName: 'UF',
    exactMatch: ['estado', 'uf', 'sigla', 'est', 'provincia', 'state'],
    regex: /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/,
  },
  pais: {
    displayName: 'País',
    exactMatch: ['pais', 'country', 'nacao'],
  },
  cep: {
    displayName: 'CEP',
    exactMatch: ['cep', 'zip', 'zipcode', 'postalcode', 'postal code', 'codigo postal'],
    regex: /^\d{5}-?\d{3}$/,
  },
  referencia: {
    displayName: 'Referência',
    exactMatch: ['referencia', 'ponto_ref', 'ref', 'ponto de referencia', 'pontoref'],
  },

  // ── PRODUTO / ITEM ──────────────────────────────────────────────────────
  produto: {
    displayName: 'Produto',
    exactMatch: ['produto', 'product', 'mercadoria'],
  },
  item: {
    displayName: 'Item',
    exactMatch: ['item', 'intem', 'itens', 'items'],
  },
  servico: {
    displayName: 'Serviço',
    exactMatch: ['servico', 'service', 'servicos'],
  },
  marca: {
    displayName: 'Marca',
    exactMatch: ['marca', 'brand'],
  },
  modelo: {
    displayName: 'Modelo',
    exactMatch: ['modelo', 'model'],
  },
  sku: {
    displayName: 'SKU',
    exactMatch: ['sku', 'cod produto', 'codigo produto', 'codigoproduto', 'ref produto'],
  },
  categoria: {
    displayName: 'Categoria',
    exactMatch: ['categoria', 'category', 'grupo', 'group'],
  },
  cor: {
    displayName: 'Cor',
    exactMatch: ['cor', 'color', 'colour'],
  },
  tamanho: {
    displayName: 'Tamanho',
    exactMatch: ['tamanho', 'tam', 'size', 'medida'],
  },
  peso: {
    displayName: 'Peso',
    exactMatch: ['peso', 'weight', 'kg', 'g'],
  },
  quantidade: {
    displayName: 'Quantidade',
    exactMatch: ['quantidade', 'qtd', 'qt', 'qtde', 'qty', 'quant', 'qnt'],
    regex: /^\d+$/,
  },
  unidade: {
    displayName: 'Unidade',
    exactMatch: ['unidade', 'un', 'und', 'unit'],
  },
  lote: {
    displayName: 'Lote',
    exactMatch: ['lote', 'lot', 'batch'],
  },
  garantia: {
    displayName: 'Garantia',
    exactMatch: ['garantia', 'warranty'],
  },

  // ── FINANCEIRO ──────────────────────────────────────────────────────────
  valor: {
    displayName: 'Valor',
    exactMatch: ['valor', 'value', 'vlr', 'vl'],
    regex: /^R?\$?\s?\d+[.,]\d{2}$/,
  },
  preco: {
    displayName: 'Preço',
    exactMatch: ['preco', 'price', 'valor unitario', 'valorunitario', 'preco unitario'],
    regex: /^R?\$?\s?\d+[.,]\d{2}$/,
  },
  total: {
    displayName: 'Total',
    exactMatch: ['total', 'total geral', 'totalgeral', 'valor total', 'valortotal'],
    regex: /^R?\$?\s?\d+[.,]?\d*$/,
  },
  subtotal: {
    displayName: 'Subtotal',
    exactMatch: ['subtotal', 'sub total'],
  },
  custo: {
    displayName: 'Custo',
    exactMatch: ['custo', 'cost', 'cst'],
  },
  desconto: {
    displayName: 'Desconto',
    exactMatch: ['desconto', 'discount', 'desc', 'deducao'],
  },
  frete: {
    displayName: 'Frete',
    exactMatch: ['frete', 'shipping', 'freight', 'entrega frete'],
  },
  juros: {
    displayName: 'Juros',
    exactMatch: ['juros', 'interest', 'taxa juros'],
  },
  multa: {
    displayName: 'Multa',
    exactMatch: ['multa', 'penalty', 'fine'],
  },
  salario: {
    displayName: 'Salário',
    exactMatch: ['salario', 'remuneracao', 'salary', 'wage'],
  },
  rendimento: {
    displayName: 'Rendimento',
    exactMatch: ['rendimento', 'income', 'renda'],
  },
  ticket: {
    displayName: 'Ticket Médio',
    exactMatch: ['ticket medio', 'ticketmedio', 'ticket', 'faturamento'],
    regex: /^R?\$?\s?\d+[.,]?\d*$/,
  },
  pagamento: {
    displayName: 'Pagamento',
    exactMatch: ['pagamento', 'payment', 'pgto'],
  },
  formapagamento: {
    displayName: 'Forma Pagamento',
    exactMatch: ['formapagamento', 'forma pagamento', 'forma de pagamento', 'payment method'],
  },
  parcelas: {
    displayName: 'Parcelas',
    exactMatch: ['parcelas', 'installments', 'parcelamento'],
  },

  // ── BANCÁRIO ────────────────────────────────────────────────────────────
  banco: {
    displayName: 'Banco',
    exactMatch: ['banco', 'bank'],
  },
  agencia: {
    displayName: 'Agência',
    exactMatch: ['agencia', 'agency', 'ag'],
  },
  conta: {
    displayName: 'Conta',
    exactMatch: ['conta', 'account', 'conta corrente', 'contacorrente'],
  },
  pix: {
    displayName: 'PIX',
    exactMatch: ['pix', 'chavepix', 'chave pix'],
  },
  boleto: {
    displayName: 'Boleto',
    exactMatch: ['boleto', 'billet'],
  },
  cartao: {
    displayName: 'Cartão',
    exactMatch: ['cartao', 'cartao credito', 'cartaocredito', 'card'],
  },

  // ── IDENTIFICADORES / DOCUMENTOS COMERCIAIS ─────────────────────────────
  codigo: {
    displayName: 'Código',
    exactMatch: ['codigo', 'cod', 'code', 'id_', 'identificador'],
  },
  pedido: {
    displayName: 'Pedido',
    exactMatch: ['pedido', 'order', 'num pedido', 'numpedido', 'numero pedido'],
  },
  ordem: {
    displayName: 'Ordem',
    exactMatch: ['ordem', 'os', 'ordem servico', 'ordemservico'],
  },
  protocolo: {
    displayName: 'Protocolo',
    exactMatch: ['protocolo', 'protocol'],
  },
  processo: {
    displayName: 'Processo',
    exactMatch: ['processo', 'process'],
  },
  notafiscal: {
    displayName: 'Nota Fiscal',
    exactMatch: ['nota', 'nf', 'nota fiscal', 'notafiscal', 'num nota', 'numnota'],
  },
  nfe: {
    displayName: 'NF-e',
    exactMatch: ['nfe', 'nfce', 'nota eletronica', 'notaeletronica'],
  },
  serie: {
    displayName: 'Série',
    exactMatch: ['serie', 'series', 'serie nota'],
  },
  chave: {
    displayName: 'Chave',
    exactMatch: ['chave', 'chave acesso', 'chaveacesso', 'key'],
  },
  contrato: {
    displayName: 'Contrato',
    exactMatch: ['contrato', 'contract', 'num contrato'],
  },
  apolice: {
    displayName: 'Apólice',
    exactMatch: ['apolice', 'policy'],
  },
  sinistro: {
    displayName: 'Sinistro',
    exactMatch: ['sinistro', 'claim'],
  },

  // ── DESCRIÇÃO / STATUS ──────────────────────────────────────────────────
  tipo: {
    displayName: 'Tipo',
    exactMatch: ['tipo', 'type', 'tp'],
  },
  status: {
    displayName: 'Status',
    exactMatch: ['status', 'situacao', 'state', 'st'],
  },
  descricao: {
    displayName: 'Descrição',
    exactMatch: ['descricao', 'description', 'desc produto', 'descricaoproduto'],
  },
  observacao: {
    displayName: 'Observação',
    exactMatch: ['obs', 'observacao', 'observation', 'nota', 'notas', 'comentario', 'comment'],
  },
  especificacao: {
    displayName: 'Especificação',
    exactMatch: ['especificacao', 'specification', 'spec'],
  },
};

export async function processFile(fileId: string, filePath: string, fileType: string): Promise<void> {
  try {
    await storage.updateFileStatus(fileId, 'processing');

    let sheets: ParsedSheet[] = [];

    if (fileType === 'csv') {
      sheets = await parseCSV(filePath);
    } else {
      sheets = await parseExcel(filePath, fileType);
    }

    let totalRows = 0;
    let totalColumns = 0;

    for (const sheet of sheets) {
      const sheetMetadata = await storage.createSheetMetadata({
        fileId,
        sheetName: sheet.name,
        sheetIndex: sheet.index,
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount,
        columnNames: sheet.columns,
      });

      totalRows += sheet.rowCount;
      totalColumns = Math.max(totalColumns, sheet.columnCount);

      await analyzeAndMapColumns(sheetMetadata.id, sheet);
    }

    await storage.updateFileStatus(fileId, 'completed', {
      totalSheets: sheets.length,
      totalRows,
      totalColumns,
    });
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    console.error('Error processing file:', errorMessage, error);
    await storage.updateFileStatus(fileId, 'error');
    throw error;
  }
}

async function parseExcel(filePath: string, fileType?: string): Promise<ParsedSheet[]> {
  try {
    const readOptions: XLSX.ParsingOptions = {
      type: 'file',
      cellDates: true,
      cellNF: false,
      cellText: true,
    };

    if (fileType === 'xls') {
      readOptions.codepage = 65001;
    }

    const workbook = XLSX.readFile(filePath, readOptions);
    const sheets: ParsedSheet[] = [];

    workbook.SheetNames.forEach((sheetName, index) => {
      const worksheet = workbook.Sheets[sheetName];
      const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (data.length === 0) return;

      const { columns, dataRows } = detectHeaderRow(data);

      sheets.push({
        name: sheetName,
        index,
        data: dataRows,
        columns,
        rowCount: dataRows.length,
        columnCount: columns.length,
      });
    });

    return sheets;
  } catch (error: any) {
    console.error('Excel parsing error:', error?.message || error);
    throw new Error(`Failed to parse Excel file: ${error?.message || 'Unknown format error'}`);
  }
}

async function parseCSV(filePath: string): Promise<ParsedSheet[]> {
  const fs = await import('fs');

  return new Promise((resolve, reject) => {
    let headerDetected = false;
    let headerIndex = 0;
    let columns: string[] = [];
    let totalRows = 0;
    let firstBatchSample: any[][] = [];
    const headerBuffer: any[][] = [];

    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });

    Papa.parse(stream as any, {
      delimiter: "",
      skipEmptyLines: true,
      relaxColumnCount: true,
      chunk: (results: any) => {
        const data = results.data as any[][];

        for (const row of data) {
          if (!headerDetected) {
            headerBuffer.push(row);
            if (headerBuffer.length >= 2) {
              const detected = detectHeaderRow(headerBuffer);
              headerIndex = detected.headerIndex;
              columns = detected.columns;
              headerDetected = true;
              for (let i = headerIndex + 1; i < headerBuffer.length; i++) {
                totalRows++;
                if (firstBatchSample.length < 10) {
                  firstBatchSample.push(headerBuffer[i]);
                }
              }
            }
          } else {
            totalRows++;
            if (firstBatchSample.length < 10) {
              firstBatchSample.push(row);
            }
          }
        }

        results.data = null;
      },
      complete: () => {
        if (!headerDetected && headerBuffer.length > 0) {
          const detected = detectHeaderRow(headerBuffer);
          headerIndex = detected.headerIndex;
          columns = detected.columns;
          for (let i = headerIndex + 1; i < headerBuffer.length; i++) {
            totalRows++;
            if (firstBatchSample.length < 10) {
              firstBatchSample.push(headerBuffer[i]);
            }
          }
        }

        if (columns.length === 0) {
          resolve([]);
          return;
        }

        resolve([
          {
            name: 'Sheet1',
            index: 0,
            data: firstBatchSample,
            columns,
            rowCount: totalRows,
            columnCount: columns.length,
          },
        ]);
      },
      error: (error: Error) => reject(error),
    });
  });
}

async function analyzeAndMapColumns(sheetId: string, sheet: ParsedSheet): Promise<void> {
  for (let colIndex = 0; colIndex < sheet.columns.length; colIndex++) {
    const columnName = sheet.columns[colIndex];
    const sampleValues = sheet.data
      .slice(0, 10)
      .map((row) => row[colIndex]?.toString() || '')
      .filter(Boolean);

    const mapping = detectFieldMapping(columnName, sampleValues);

    await storage.createColumnMapping({
      sheetId,
      originalColumnName: columnName,
      columnIndex: colIndex,
      mappedFieldName: mapping.field,
      detectionMethod: mapping.method,
      confidence: mapping.confidence,
      sampleValues,
    });
  }
}

function detectFieldMapping(
  columnName: string,
  sampleValues: string[]
): { field: string | null; method: string; confidence: number } {
  const normalized = normalizeStr(columnName);
  const noSpaces = normalized.replace(/\s+/g, '');

  // Try exact match (with and without spaces/accents)
  for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
    if (patterns.exactMatch) {
      const matched = patterns.exactMatch.some((term) => {
        const normTerm = normalizeStr(term);
        return normalized === normTerm ||
          noSpaces === normTerm.replace(/\s+/g, '') ||
          normalized.includes(normTerm) ||
          normTerm.includes(normalized);
      });
      if (matched) {
        return { field: fieldName, method: 'exact_match', confidence: 95 };
      }
    }
  }

  // Try regex pattern matching on sample values
  for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
    if ('regex' in patterns && patterns.regex) {
      const matches = sampleValues.filter((val) => patterns.regex!.test(val.trim()));
      const matchRate = matches.length / Math.max(sampleValues.length, 1);

      if (matchRate > 0.7) {
        return { field: fieldName, method: 'regex', confidence: Math.floor(matchRate * 100) };
      }
    }
  }

  // Try fuzzy matching
  for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
    if ('fuzzyTerms' in patterns && patterns.fuzzyTerms) {
      const fuzzyMatch = patterns.fuzzyTerms!.some((term: string) => {
        const distance = levenshteinDistance(normalized, normalizeStr(term));
        return distance <= 2;
      });

      if (fuzzyMatch) {
        return { field: fieldName, method: 'fuzzy', confidence: 70 };
      }
    }
  }

  return { field: null, method: 'none', confidence: 0 };
}

export function getFieldDisplayName(fieldKey: string): string {
  return FIELD_PATTERNS[fieldKey]?.displayName ?? fieldKey;
}

export function getAllFieldPatterns() {
  return Object.entries(FIELD_PATTERNS).map(([key, val]) => ({
    key,
    displayName: val.displayName,
    exactMatch: val.exactMatch ?? [],
  }));
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}
