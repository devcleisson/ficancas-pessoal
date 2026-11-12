import type { AccountType, Frequency, PaymentMethod } from "./types";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit: "Cartão de débito",
  credit: "Cartão de crédito",
  boleto: "Boleto",
  transfer: "Transferência",
  auto_debit: "Débito automático",
  deposit: "Depósito",
  other: "Outro",
};

/** Formas de pagamento oferecidas no cadastro de despesas. */
export const EXPENSE_METHODS: PaymentMethod[] = ["pix", "debit", "credit", "cash", "boleto", "transfer", "auto_debit", "other"];
/** Formas de recebimento oferecidas no cadastro de receitas. */
export const INCOME_METHODS: PaymentMethod[] = ["pix", "transfer", "deposit", "cash", "boleto", "other"];
/** Formas de pagamento para contas recorrentes. */
export const BILL_METHODS: PaymentMethod[] = ["boleto", "pix", "auto_debit", "debit", "transfer", "cash", "other"];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  investment: "Investimentos",
  cash: "Dinheiro em espécie",
  other: "Outra",
};

/** Tipos de conta cujo saldo conta como "guardado". */
export const SAVINGS_ACCOUNT_TYPES: AccountType[] = ["savings", "investment"];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

export const BUDGET_THRESHOLDS = { warning: 0.7, danger: 0.9 } as const;

/** Dias de antecedência para avisar sobre contas a vencer. */
export const DUE_SOON_DAYS = 7;

export const COLOR_OPTIONS = [
  "#10b981", "#22c55e", "#84cc16", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#d946ef", "#ec4899", "#f43f5e", "#ef4444", "#f97316", "#eab308", "#78716c",
  "#64748b", "#3f3f46",
];
