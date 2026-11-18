/**
 * Leitura de extratos bancários (OFX e CSV), sugestão de categoria e
 * detecção de lançamentos já cadastrados. Funções puras, testadas em
 * test/statement.test.ts.
 */
import { addDays, isValidISODate, parseMoney, toCents } from "./format";
import type { Category, ISODate, Kind, PaymentMethod, Transaction } from "./types";

export interface StatementRow {
  /** Posição no arquivo (para exibir e para chaves estáveis). */
  index: number;
  date: ISODate;
  description: string;
  /** Valor com sinal: positivo = entrada, negativo = saída. */
  amount: number;
  /** Categoria informada no próprio arquivo (CSV exportado pelo sistema). */
  categoryName?: string;
}

export interface ParsedStatement {
  format: "ofx" | "csv";
  rows: StatementRow[];
  /** Linhas ignoradas (sem data ou valor válidos). */
  skipped: number;
  /** Para CSV: colunas encontradas, permitindo ao usuário corrigir. */
  csv?: CsvLayout;
  /** Para OFX: tipo de conta informado no arquivo. */
  accountType?: "bank" | "creditcard";
}

// ---------------------------------------------------------------------------
// Texto do arquivo
// ---------------------------------------------------------------------------

/** Decodifica o arquivo tentando UTF-8 e, se falhar, Windows-1252 (comum em OFX de bancos). */
export function decodeFile(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function detectFormat(text: string, fileName = ""): "ofx" | "csv" {
  if (/\.(ofx|qfx)$/i.test(fileName)) return "ofx";
  return /<OFX>|OFXHEADER|<STMTTRN>/i.test(text.slice(0, 5000)) ? "ofx" : "csv";
}

// ---------------------------------------------------------------------------
// Datas e valores
// ---------------------------------------------------------------------------

/** Aceita 31/12/2026, 31/12/26, 31-12-2026, 31.12.2026, 2026-12-31 e 20261231. */
export function parseAnyDate(input: string): ISODate | null {
  const t = (input ?? "").trim().replace(/\s.*$/, "");
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    const iso = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isValidISODate(iso) ? iso : null;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    return isValidISODate(iso) ? iso : null;
  }
  m = t.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    return isValidISODate(iso) ? iso : null;
  }
  return null;
}

/** Valor de extrato: "-1.234,56", "1234.56", "R$ -10,00", "-R$ 10,00", "50,00 D", "(12,00)". */
export function parseStatementAmount(input: string): number | null {
  let s = (input ?? "").trim();
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  const suffix = s.match(/\s*([DC])$/i);
  if (suffix) {
    if (suffix[1].toUpperCase() === "D") sign = -sign;
    s = s.slice(0, -suffix[0].length);
  }
  s = s.replace(/R\$/gi, "").replace(/\s/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  const v = parseMoney(s);
  return v == null ? null : v * sign;
}

// ---------------------------------------------------------------------------
// OFX
// ---------------------------------------------------------------------------

function ofxField(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : undefined;
}

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'");

export function parseOFX(text: string): ParsedStatement {
  const blocks = text.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  const rows: StatementRow[] = [];
  let skipped = 0;
  blocks.forEach((b) => {
    const date = parseAnyDate(ofxField(b, "DTPOSTED") ?? "");
    const amount = parseStatementAmount(ofxField(b, "TRNAMT") ?? "");
    const memo = ofxField(b, "MEMO");
    const name = ofxField(b, "NAME");
    let description = decodeEntities([name, memo].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" - "));
    if (!description) description = ofxField(b, "TRNTYPE") ?? "Lançamento";
    if (!date || amount == null || amount === 0) {
      skipped++;
      return;
    }
    rows.push({ index: rows.length, date, description: description.slice(0, 120), amount });
  });
  return { format: "ofx", rows, skipped, accountType: /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(text) ? "creditcard" : "bank" };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Lê CSV com ";" "," ou tab, com aspas. O separador é o mais frequente nas primeiras linhas. */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const sample = src.split(/\r?\n/).slice(0, 15).join("\n");
  const count = (c: string) => (sample.match(new RegExp(c === "\t" ? "\\t" : c, "g")) ?? []).length;
  const sep = [";", ",", "\t"].sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export interface CsvLayout {
  /** Índice da linha de cabeçalho (-1 = sem cabeçalho). */
  headerRow: number;
  headers: string[];
  date: number;
  description: number;
  /** Segunda coluna de texto (ex.: "Histórico" + "Descrição"), -1 se não houver. */
  description2: number;
  /** Coluna única de valor com sinal (ou -1 quando há colunas separadas). */
  amount: number;
  credit: number;
  debit: number;
  /** Coluna "Tipo" (Receita/Despesa, C/D, Crédito/Débito). */
  type: number;
  category: number;
}

export const norm = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const H = {
  date: ["data", "date", "dt", "data lancamento", "data do lancamento", "data da transacao", "data movimento", "data mov"],
  description: ["descricao", "description", "historico", "lancamento", "title", "titulo", "memo", "estabelecimento", "detalhes", "nome", "identificacao", "transacao"],
  amount: ["valor", "value", "amount", "valor (r$)", "valor r$", "quantia", "montante"],
  credit: ["credito", "entrada", "entradas", "creditos", "valor credito"],
  debit: ["debito", "saida", "saidas", "debitos", "valor debito"],
  type: ["tipo", "type", "natureza", "c/d", "d/c"],
  category: ["categoria", "category"],
};

function findHeader(cells: string[], names: string[]): number {
  const n = cells.map(norm);
  let i = n.findIndex((c) => names.includes(c));
  if (i < 0) i = n.findIndex((c) => names.some((x) => x.length > 3 && c.startsWith(x)));
  return i;
}

/** Descobre quais colunas são data, descrição e valor. */
export function detectCsvLayout(rows: string[][]): CsvLayout | null {
  // 1) Procura uma linha de cabeçalho nas primeiras linhas.
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const cells = rows[r];
    const date = findHeader(cells, H.date);
    if (date < 0) continue;
    let amount = findHeader(cells, H.amount);
    const credit = findHeader(cells, H.credit);
    const debit = findHeader(cells, H.debit);
    if (amount < 0 && (credit < 0 || debit < 0)) continue;
    // Nunca usar a coluna de saldo como valor.
    if (amount >= 0 && /saldo/.test(norm(cells[amount]))) amount = -1;
    let description = findHeader(cells, H.description);
    if (description < 0 || description === date) {
      // Escolhe a coluna de texto mais longa como descrição.
      description = guessDescriptionColumn(rows.slice(r + 1, r + 30), [date, amount, credit, debit]);
    }
    if (description < 0) continue;
    // Bancos que separam "Histórico" e "Descrição": usa as duas.
    const n = cells.map(norm);
    const hist = n.findIndex((c) => c === "historico" || c === "lancamento");
    const desc = n.findIndex((c, i) => i !== hist && (c === "descricao" || c === "detalhes" || c === "complemento"));
    const description2 = hist >= 0 && desc >= 0 ? (description === hist ? desc : hist) : -1;
    return {
      headerRow: r,
      headers: cells.map((c) => c.trim()),
      date,
      description,
      description2,
      amount: amount >= 0 ? amount : -1,
      credit: amount >= 0 ? -1 : credit,
      debit: amount >= 0 ? -1 : debit,
      type: findHeader(cells, H.type),
      category: findHeader(cells, H.category),
    };
  }
  // 2) Sem cabeçalho: deduz pelas colunas cujos valores parecem datas e valores.
  const sample = rows.slice(0, 40);
  const width = Math.max(0, ...sample.map((r) => r.length));
  const score = (col: number, fn: (s: string) => boolean) => sample.filter((r) => r[col] != null && fn(r[col])).length;
  let date = -1;
  let amount = -1;
  for (let c = 0; c < width; c++) {
    if (date < 0 && score(c, (s) => parseAnyDate(s) != null) >= sample.length * 0.6) date = c;
  }
  for (let c = width - 1; c >= 0; c--) {
    if (c !== date && score(c, (s) => /\d/.test(s) && parseStatementAmount(s) != null) >= sample.length * 0.6) {
      amount = c;
      // Se houver duas colunas numéricas, a última costuma ser o saldo: prefere a anterior.
      const prev = c - 1;
      if (prev >= 0 && prev !== date && score(prev, (s) => /\d/.test(s) && parseStatementAmount(s) != null) >= sample.length * 0.6) amount = prev;
      break;
    }
  }
  if (date < 0 || amount < 0) return null;
  const description = guessDescriptionColumn(sample, [date, amount]);
  if (description < 0) return null;
  return { headerRow: -1, headers: Array.from({ length: width }, (_, i) => `Coluna ${i + 1}`), date, description, description2: -1, amount, credit: -1, debit: -1, type: -1, category: -1 };
}

function guessDescriptionColumn(rows: string[][], exclude: number[]): number {
  const width = Math.max(0, ...rows.map((r) => r.length));
  let best = -1;
  let bestLen = 0;
  for (let c = 0; c < width; c++) {
    if (exclude.includes(c)) continue;
    const texts = rows.map((r) => (r[c] ?? "").trim()).filter((s) => s && parseStatementAmount(s) == null && !parseAnyDate(s));
    const avg = texts.reduce((a, s) => a + s.length, 0) / Math.max(1, rows.length);
    if (avg > bestLen) {
      bestLen = avg;
      best = c;
    }
  }
  return best;
}

export function csvToRows(rows: string[][], layout: CsvLayout): ParsedStatement {
  const out: StatementRow[] = [];
  let skipped = 0;
  for (const r of rows.slice(layout.headerRow + 1)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const date = parseAnyDate(get(layout.date));
    let amount: number | null;
    if (layout.amount >= 0) amount = parseStatementAmount(get(layout.amount));
    else {
      const c = parseStatementAmount(get(layout.credit));
      const d = parseStatementAmount(get(layout.debit));
      amount = c ? Math.abs(c) : d ? -Math.abs(d) : null;
    }
    if (amount != null && layout.type >= 0) {
      const t = norm(get(layout.type));
      if (/^(d|debito|despesa|saida|expense|debit)/.test(t)) amount = -Math.abs(amount);
      else if (/^(c|credito|receita|entrada|income|credit)/.test(t)) amount = Math.abs(amount);
    }
    const description = [get(layout.description), get(layout.description2)]
      .filter(Boolean)
      .join(" - ")
      .replace(/\s+/g, " ")
      .slice(0, 120);
    if (!date || amount == null || amount === 0 || !description) {
      skipped++;
      continue;
    }
    // Linhas de saldo ("SALDO ANTERIOR", "SALDO DO DIA") não são lançamentos.
    if (/^saldo\b|^s a l d o/.test(norm(description))) {
      skipped++;
      continue;
    }
    out.push({ index: out.length, date, description, amount, categoryName: layout.category >= 0 ? get(layout.category) || undefined : undefined });
  }
  return { format: "csv", rows: out, skipped, csv: layout };
}

export function parseStatement(text: string, fileName = ""): ParsedStatement | { error: string } {
  if (detectFormat(text, fileName) === "ofx") {
    const r = parseOFX(text);
    return r.rows.length ? r : { error: "Não encontramos lançamentos neste arquivo OFX." };
  }
  const rows = parseDelimited(text);
  const layout = detectCsvLayout(rows);
  if (!layout) return { error: "Não conseguimos identificar as colunas de data, descrição e valor deste CSV." };
  const r = csvToRows(rows, layout);
  return r.rows.length ? r : { error: "Nenhum lançamento válido encontrado no arquivo." };
}

// ---------------------------------------------------------------------------
// Sugestão de categoria
// ---------------------------------------------------------------------------

/**
 * Chave usada para reconhecer o "mesmo estabelecimento": sem acentos, números,
 * pontuação e prefixos de banco ("compra no debito", "pix enviado"...).
 */
export function merchantKey(description: string): string {
  let s = norm(description)
    .replace(/[*_/\\|.,;:()[\]{}#'"-]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const prefixes = [
    "compra no debito", "compra no credito", "compra com cartao", "compra cartao", "compra debito", "compra credito", "compra",
    "pagamento de boleto", "pagamento boleto", "pagto boleto", "pag boleto", "pagamento", "pagto", "pag",
    "transferencia enviada pelo pix", "transferencia recebida pelo pix", "transferencia enviada", "transferencia recebida", "transferencia",
    "pix enviado", "pix recebido", "pix transf", "pix qrs", "pix", "ted enviada", "ted recebida", "ted", "doc", "debito automatico", "deb aut",
    "elo", "visa", "mastercard", "maestro", "electron", "cartao", "debito", "credito", "enviado", "recebido", "para", "de", "em",
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of prefixes) {
      if (s === p) break;
      if (s.startsWith(`${p} `)) {
        s = s.slice(p.length + 1).trim();
        changed = true;
      }
    }
  }
  return s.split(" ").slice(0, 4).join(" ");
}

/** Palavras-chave → nome da categoria padrão. A primeira regra que casar vence. */
const RULES: { kind: Kind; category: string; words: string[] }[] = [
  { kind: "expense", category: "Cartão de crédito", words: ["pagamento de fatura", "pagto fatura", "pag fatura", "fatura cartao", "pagamento fatura", "fatura nubank"] },
  { kind: "expense", category: "Compras", words: ["mercado livre", "mercadolivre", "mercado pago", "mercadopago", "mp mercado"] },
  { kind: "expense", category: "Assinaturas", words: ["netflix", "spotify", "prime video", "amazon prime", "primevideo", "disney", "hbo", "max com", "globoplay", "youtube", "deezer", "apple com bill", "icloud", "google one", "google storage", "paramount", "crunchyroll", "chatgpt", "openai", "canva"] },
  { kind: "expense", category: "Alimentação", words: ["ifood", "ifd", "rappi", "restaurante", "lanchonete", "padaria", "panificadora", "supermercado", "mercado", "atacadao", "assai", "carrefour", "pao de acucar", "extra ", "big bompreco", "atacarejo", "hortifruti", "acougue", "burger", "mcdonald", "mc donald", "bk ", "subway", "pizza", "acai", "cafe", "cafeteria", "starbucks", "outback", "habibs", "giraffas", "spoleto", "churrascaria", "sorveteria", "doceria", "emporio", "quitanda"] },
  { kind: "expense", category: "Transporte", words: ["uber", "99app", "99 app", "99pop", "99 pop", "99 taxi", "cabify", "posto", "combust", "shell", "ipiranga", "petrobras", "br mania", "auto posto", "estacionamento", "estapar", "pedagio", "sem parar", "semparar", "veloe", "conectcar", "metro", "onibus", "bilhete unico", "cptm", "passagem", "taxi", "detran", "ipva", "oficina", "autopecas", "lava jato"] },
  { kind: "expense", category: "Saúde", words: ["farmacia", "drogaria", "droga raia", "drogasil", "pague menos", "panvel", "ultrafarma", "hospital", "clinica", "laboratorio", "unimed", "hapvida", "amil", "bradesco saude", "sulamerica", "odonto", "dentista", "consulta", "psicolog", "fisioterap", "exame"] },
  { kind: "expense", category: "Academia", words: ["academia", "smart fit", "smartfit", "bluefit", "gympass", "wellhub", "totalpass", "crossfit", "bodytech", "selfit", "pilates"] },
  { kind: "expense", category: "Moradia", words: ["aluguel", "condominio", "energia", "enel", "cemig", "light s", "copel", "celpe", "coelba", "cosern", "equatorial", "neoenergia", "energisa", "sabesp", "compesa", "cagece", "caesb", "embasa", "saneamento", "agua e esgoto", "comgas", "iptu", "internet", "claro", "vivo", "telefonica", "tim ", "oi fibra", "net servicos", "brisanet", "imobiliaria"] },
  { kind: "expense", category: "Educação", words: ["escola", "colegio", "faculdade", "universidade", "curso", "udemy", "alura", "coursera", "hotmart", "livraria", "estacio", "anhanguera", "unopar", "uninter", "unip", "cruzeiro do sul", "mensalidade escolar", "material escolar", "duolingo"] },
  { kind: "expense", category: "Lazer", words: ["cinema", "cinemark", "kinoplex", "ingresso", "sympla", "eventim", "ticket", "bar ", "boteco", "pub ", "show", "teatro", "steam", "playstation", "psn", "xbox", "nintendo", "hotel", "pousada", "airbnb", "booking", "decolar", "latam", "gol linhas", "azul linhas", "smiles", "parque", "clube"] },
  { kind: "expense", category: "Tecnologia", words: ["kabum", "pichau", "terabyte", "apple store", "samsung", "dell", "lenovo", "positivo", "multilaser", "google play", "app store", "microsoft", "adobe", "hostinger", "godaddy", "registro br", "aws", "github"] },
  { kind: "expense", category: "Compras", words: ["mercado livre", "mercadolivre", "mercadopago", "amazon", "shopee", "shein", "aliexpress", "magalu", "magazine luiza", "americanas", "casas bahia", "ponto frio", "renner", "riachuelo", "c&a", "cea ", "zara", "centauro", "netshoes", "decathlon", "havan", "leroy", "tok stok", "boticario", "natura", "sephora", "loja", "lojas", "shopping"] },
  { kind: "income", category: "Salário", words: ["salario", "folha de pagamento", "folha pgto", "pagamento de salario", "proventos", "vencimentos", "remuneracao", "credito salario", "adiantamento salarial", "13o salario", "ferias"] },
  { kind: "income", category: "Investimentos", words: ["rendimento", "rend pago", "rendimentos", "juros", "dividendo", "jcp", "resgate", "cdb", "tesouro", "remuneracao aplicacao", "rend poupanca"] },
  { kind: "income", category: "Vendas", words: ["venda", "mercadopago", "pagseguro", "stone", "cielo", "sumup", "getnet", "infinitepay", "rede "] },
];

export interface Suggestion {
  categoryId: string | null;
  source: "file" | "history" | "rule" | null;
}

/** Aprende com o histórico: estabelecimento → categoria mais usada. */
export function buildHistory(transactions: Pick<Transaction, "description" | "category_id" | "kind">[]) {
  const counts = new Map<string, Map<string, number>>();
  for (const t of transactions) {
    if (!t.category_id) continue;
    const key = `${t.kind}|${merchantKey(t.description)}`;
    if (key.endsWith("|")) continue;
    const m = counts.get(key) ?? new Map<string, number>();
    m.set(t.category_id, (m.get(t.category_id) ?? 0) + 1);
    counts.set(key, m);
  }
  const best = new Map<string, string>();
  for (const [k, m] of counts) best.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return best;
}

export function suggestCategory(
  row: Pick<StatementRow, "description" | "categoryName">,
  kind: Kind,
  categories: Pick<Category, "id" | "name" | "kind">[],
  history: Map<string, string>,
): Suggestion {
  const byName = new Map(categories.filter((c) => c.kind === kind).map((c) => [norm(c.name), c.id]));
  if (row.categoryName) {
    const id = byName.get(norm(row.categoryName));
    if (id) return { categoryId: id, source: "file" };
  }
  const learned = history.get(`${kind}|${merchantKey(row.description)}`);
  if (learned && categories.some((c) => c.id === learned)) return { categoryId: learned, source: "history" };
  const text = ` ${norm(row.description).replace(/[*_/\\|.,;:-]+/g, " ").replace(/\s+/g, " ")} `;
  for (const r of RULES) {
    if (r.kind !== kind) continue;
    if (r.words.some((w) => text.includes(w.endsWith(" ") ? ` ${w}` : w))) {
      const id = byName.get(norm(r.category));
      if (id) return { categoryId: id, source: "rule" };
    }
  }
  return { categoryId: null, source: null };
}

/** Forma de pagamento provável a partir da descrição. */
export function guessMethod(description: string, kind: Kind): PaymentMethod {
  const t = norm(description);
  if (/\bpix\b/.test(t)) return "pix";
  if (/boleto|bloqueto/.test(t)) return "boleto";
  if (/\bdeb(ito)? ?aut/.test(t)) return "auto_debit";
  if (/\bted\b|\bdoc\b|transf/.test(t)) return "transfer";
  if (kind === "income") return /deposito/.test(t) ? "deposit" : "other";
  if (/saque/.test(t)) return "cash";
  if (/debito|compra|cartao|visa|elo|master/.test(t)) return "debit";
  return "other";
}

// ---------------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------------

export type DuplicateState = "new" | "duplicate" | "possible";

const descKey = (s: string) => norm(s).replace(/\s+/g, " ");

/**
 * Marca linhas que já existem no destino:
 * - "duplicate": mesma data, valor, tipo e descrição (ex.: extrato importado de novo);
 * - "possible": mesmo valor e tipo com data até 1 dia de diferença (ex.: lançado à mão).
 * Cada lançamento existente só "consome" uma linha do extrato.
 */
export function findDuplicates(
  rows: { date: ISODate; amount: number; description: string }[],
  existing: Pick<Transaction, "date" | "amount" | "kind" | "description">[],
): DuplicateState[] {
  const kindOf = (a: number): Kind => (a < 0 ? "expense" : "income");
  const used = new Set<number>();
  const result: DuplicateState[] = rows.map(() => "new");
  // Primeiro os exatos, depois os possíveis.
  rows.forEach((r, i) => {
    const k = kindOf(r.amount);
    const cents = Math.abs(toCents(r.amount));
    const j = existing.findIndex((e, idx) => !used.has(idx) && e.kind === k && toCents(e.amount) === cents && e.date === r.date && descKey(e.description) === descKey(r.description));
    if (j >= 0) {
      used.add(j);
      result[i] = "duplicate";
    }
  });
  rows.forEach((r, i) => {
    if (result[i] !== "new") return;
    const k = kindOf(r.amount);
    const cents = Math.abs(toCents(r.amount));
    const near = [addDays(r.date, -1), r.date, addDays(r.date, 1)];
    const j = existing.findIndex((e, idx) => !used.has(idx) && e.kind === k && toCents(e.amount) === cents && near.includes(e.date));
    if (j >= 0) {
      used.add(j);
      result[i] = "possible";
    }
  });
  return result;
}
