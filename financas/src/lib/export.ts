import { PAYMENT_METHOD_LABEL } from "./constants";
import { formatDate, formatNumber } from "./format";
import type { FinanceData, Transaction } from "./types";

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

