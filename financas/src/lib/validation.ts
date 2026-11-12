import { isValidISODate } from "./format";
import type { Frequency, Kind, PaymentMethod, TxStatus } from "./types";

export type Errors = Record<string, string>;

const MAX_AMOUNT = 999_999_999;

function amountError(v: number | null | undefined, { allowNegative = false, allowZero = false } = {}): string | undefined {
  if (v == null || Number.isNaN(v)) return "Informe um valor válido.";
  if (!allowNegative && v < 0) return "O valor não pode ser negativo.";
  if (!allowZero && v === 0) return "O valor deve ser maior que zero.";
  if (Math.abs(v) > MAX_AMOUNT) return "Valor alto demais.";
  if (Math.round(v * 100) !== Math.round(v * 100 * 1000) / 1000) return "Use no máximo 2 casas decimais.";
  return undefined;
}

function textError(v: string | null | undefined, label: string, max: number, required = true): string | undefined {
  const s = (v ?? "").trim();
  if (required && !s) return `Informe ${label}.`;
  if (s.length > max) return `Máximo de ${max} caracteres.`;
  return undefined;
}

function compact(e: Record<string, string | undefined>): Errors {
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v)) as Errors;
}

export interface TransactionInput {
  kind: Kind;
  description: string;
  amount: number | null;
  date: string;
  category_id: string | null;
  account_id: string | null;
  card_id: string | null;
  payment_method: PaymentMethod;
  status: TxStatus;
  notes?: string | null;
  source?: string | null;
  installments?: number;
}

export function validateTransaction(t: TransactionInput): Errors {
  const isCard = t.kind === "expense" && t.payment_method === "credit";
  return compact({
    description: textError(t.description, t.kind === "income" ? "a descrição" : "o nome da despesa", 120),
    amount: amountError(t.amount),
    date: isValidISODate(t.date) ? undefined : "Informe uma data válida.",
    category_id: t.category_id ? undefined : "Escolha uma categoria.",
    card_id: isCard && !t.card_id ? "Escolha o cartão de crédito." : undefined,
    account_id:
      !isCard && t.status === "paid" && !t.account_id
        ? t.kind === "income"
          ? "Escolha a conta que recebeu o valor."
          : "Escolha a conta de onde saiu o dinheiro."
        : undefined,
    notes: textError(t.notes, "", 500, false),
    source: textError(t.source, "", 80, false),
    installments:
      t.installments != null && (t.installments < 1 || t.installments > 48 || !Number.isInteger(t.installments))
        ? "Parcelas entre 1 e 48."
        : undefined,
  });
}

export function validateAccount(a: { name: string; initial_balance: number | null }): Errors {
  return compact({
    name: textError(a.name, "o nome da conta", 60),
    initial_balance: amountError(a.initial_balance, { allowNegative: true, allowZero: true }),
  });
}

export function validateCard(c: { name: string; limit_amount: number | null; closing_day: number; due_day: number }): Errors {
  const day = (d: number) => (Number.isInteger(d) && d >= 1 && d <= 31 ? undefined : "Dia entre 1 e 31.");
  return compact({
    name: textError(c.name, "o nome do cartão", 60),
    limit_amount: amountError(c.limit_amount),
    closing_day: day(c.closing_day),
    due_day: day(c.due_day) ?? (c.due_day === c.closing_day ? "O vencimento deve ser diferente do fechamento." : undefined),
  });
}

export function validateBill(b: { name: string; amount: number | null; next_due_date: string; frequency: Frequency }): Errors {
  return compact({
    name: textError(b.name, "o nome da conta", 80),
    amount: amountError(b.amount),
    next_due_date: isValidISODate(b.next_due_date) ? undefined : "Informe o próximo vencimento.",
    frequency: ["weekly", "monthly", "yearly"].includes(b.frequency) ? undefined : "Escolha a frequência.",
  });
}

export function validateGoal(g: { name: string; target_amount: number | null; deadline: string | null; initial?: number | null }): Errors {
  return compact({
    name: textError(g.name, "o nome da meta", 80),
    target_amount: amountError(g.target_amount),
    deadline: g.deadline && !isValidISODate(g.deadline) ? "Data inválida." : undefined,
    initial: g.initial != null ? amountError(g.initial, { allowZero: true }) : undefined,
  });
}

export function validateBudget(b: { category_id: string | null; amount: number | null }): Errors {
  return compact({
    category_id: b.category_id ? undefined : "Escolha uma categoria.",
    amount: amountError(b.amount),
  });
}

export function validateTransfer(t: { from_account_id: string | null; to_account_id: string | null; amount: number | null; date: string }): Errors {
  return compact({
    from_account_id: t.from_account_id ? undefined : "Escolha a conta de origem.",
    to_account_id: !t.to_account_id
      ? "Escolha a conta de destino."
      : t.to_account_id === t.from_account_id
        ? "Origem e destino devem ser diferentes."
        : undefined,
    amount: amountError(t.amount),
    date: isValidISODate(t.date) ? undefined : "Informe uma data válida.",
  });
}

export function validateCategory(c: { name: string }): Errors {
  return compact({ name: textError(c.name, "o nome da categoria", 40) });
}
