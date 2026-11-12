import { PAYMENT_METHOD_LABEL } from "./constants";
import { formatDate, formatNumber, parseMoney, isValidISODate } from "./format";
import type { Category, FinanceData, Kind, PaymentMethod, Transaction } from "./types";

// ---------------------------------------------------------------------------
// CSV (padrão brasileiro: separador ";" e vírgula decimal; abre direto no Excel)
// ---------------------------------------------------------------------------

const escapeCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map(escapeCell).join(";")).join("\r\n");
}

export const TRANSACTION_CSV_HEADER = [
  "Data", "Tipo", "Descrição", "Valor", "Categoria", "Conta", "Cartão", "Forma de pagamento", "Status", "Fixa/Variável", "Origem", "Observações", "Parcela",
];

export function transactionsToRows(txs: Transaction[], data: Pick<FinanceData, "categories" | "accounts" | "cards">) {
  const cat = new Map(data.categories.map((c) => [c.id, c.name]));
  const acc = new Map(data.accounts.map((a) => [a.id, a.name]));
  const card = new Map(data.cards.map((c) => [c.id, c.name]));
  return txs.map((t) => [
    formatDate(t.date),
    t.kind === "income" ? "Receita" : "Despesa",
    t.description,
    formatNumber(t.amount),
    t.category_id ? cat.get(t.category_id) ?? "" : "",
    t.account_id ? acc.get(t.account_id) ?? "" : "",
    t.card_id ? card.get(t.card_id) ?? "" : "",
    PAYMENT_METHOD_LABEL[t.payment_method],
    t.card_id ? "Cartão" : t.status === "paid" ? (t.kind === "income" ? "Recebida" : "Paga") : "Pendente",
    t.expense_type === "fixed" ? "Fixa" : t.expense_type === "variable" ? "Variável" : "",
    t.source ?? "",
    t.notes ?? "",
    t.installment_total ? `${t.installment_number}/${t.installment_total}` : "",
  ]);
}

export function downloadFile(name: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Importação de CSV de movimentações
// ---------------------------------------------------------------------------

/** Lê CSV com separador ";" ou "," e aspas. */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g) ?? []).length >= (firstLine.match(/,/g) ?? []).length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function parseDateBR(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isValidISODate(iso) ? iso : null;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m && isValidISODate(t) ? t : null;
}

export interface ImportedRow {
  line: number;
  value?: Partial<Transaction>;
  error?: string;
  description?: string;
}

/**
 * Converte linhas de CSV em lançamentos. Colunas reconhecidas (cabeçalho):
 * Data, Tipo, Descrição, Valor, Categoria, Conta, Forma de pagamento, Status, Observações.
 * Valores negativos sem coluna "Tipo" são tratados como despesa.
 */
export function rowsToTransactions(rows: string[][], data: Pick<FinanceData, "categories" | "accounts">, defaultAccountId: string | null): ImportedRow[] {
  if (rows.length < 2) return [];
  const header = rows[0].map(norm);
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iDate = col("data", "date");
  const iKind = col("tipo", "type");
  const iDesc = col("descricao", "description", "nome", "historico");
  const iValue = col("valor", "value", "amount");
  const iCat = col("categoria", "category");
  const iAcc = col("conta", "account");
  const iMethod = col("forma de pagamento", "forma", "metodo");
  const iStatus = col("status", "situacao");
  const iNotes = col("observacoes", "observacao", "notas", "notes");
  if (iDate < 0 || iDesc < 0 || iValue < 0) {
    return [{ line: 1, error: "Cabeçalho inválido: são obrigatórias as colunas Data, Descrição e Valor." }];
  }

  const catByName = (kind: Kind) => new Map(data.categories.filter((c) => c.kind === kind).map((c) => [norm(c.name), c] as [string, Category]));
  const cats = { income: catByName("income"), expense: catByName("expense") };
  const accByName = new Map(data.accounts.map((a) => [norm(a.name), a.id]));
  const methodByLabel = new Map(Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => [norm(v), k as PaymentMethod]));

  return rows.slice(1).map((r, idx) => {
    const line = idx + 2;
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const date = parseDateBR(get(iDate));
    const rawValue = parseMoney(get(iValue));
    const description = get(iDesc).slice(0, 120);
    if (!date) return { line, description, error: "Data inválida (use DD/MM/AAAA)." };
    if (!description) return { line, error: "Descrição vazia." };
    if (rawValue == null || rawValue === 0) return { line, description, error: "Valor inválido." };
    const kindText = norm(get(iKind));
    const kind: Kind = kindText.startsWith("rec") || kindText === "income" ? "income" : kindText.startsWith("desp") || kindText === "expense" ? "expense" : rawValue < 0 ? "expense" : "income";
    const cat = cats[kind].get(norm(get(iCat)));
    const accountId = accByName.get(norm(get(iAcc))) ?? defaultAccountId;
    let method = methodByLabel.get(norm(get(iMethod))) ?? (kind === "income" ? "transfer" : "pix");
    if (method === "credit") method = "other"; // compras no cartão devem ser lançadas pela tela de cartões
    const statusText = norm(get(iStatus));
    const status = statusText.startsWith("pend") || statusText.startsWith("a rec") ? "pending" : "paid";
    if (status === "paid" && !accountId) return { line, description, error: "Informe a conta (coluna Conta) ou escolha uma conta padrão." };
    return {
      line,
      description,
      value: {
        kind,
        description,
        amount: Math.abs(rawValue),
        date,
        category_id: cat?.id ?? null,
        account_id: accountId,
        card_id: null,
        payment_method: method,
        status,
        expense_type: kind === "expense" ? "variable" : null,
        notes: get(iNotes).slice(0, 500) || null,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Backup completo (JSON)
// ---------------------------------------------------------------------------

export const BACKUP_VERSION = 1;

export function buildBackup(data: FinanceData) {
  return {
    app: "financas-pessoais",
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    data: {
      categories: data.categories,
      accounts: data.accounts,
      credit_cards: data.cards,
      recurring_bills: data.bills,
      transactions: data.transactions,
      transfers: data.transfers,
      card_payments: data.cardPayments,
      budgets: data.budgets,
      goals: data.goals,
      goal_contributions: data.contributions,
    },
  };
}

/** Ordem de restauração respeitando as chaves estrangeiras. */
export const RESTORE_ORDER = [
  "categories", "accounts", "credit_cards", "recurring_bills", "goals", "transactions", "transfers", "card_payments", "budgets", "goal_contributions",
] as const;

