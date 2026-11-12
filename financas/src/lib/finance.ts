/**
 * Regras financeiras puras (sem React, sem rede). Tudo aqui é testado em
 * test/finance.test.ts.
 */
import {
  addDays,
  addMonths,
  daysInMonth,
  diffDays,
  formatDate,
  fromCents,
  monthEnd,
  monthKey,
  shiftMonth,
  sumMoney,
  toCents,
} from "./format";
import { BUDGET_THRESHOLDS, DUE_SOON_DAYS, SAVINGS_ACCOUNT_TYPES } from "./constants";
import type {
  Account,
  Budget,
  CardPayment,
  Category,
  CreditCard,
  FinanceData,
  Frequency,
  Goal,
  GoalContribution,
  ISODate,
  Kind,
  RecurringBill,
  Transaction,
  Transfer,
} from "./types";

// ---------------------------------------------------------------------------
// Saldos de contas
// ---------------------------------------------------------------------------

type BalanceInput = Pick<FinanceData, "accounts" | "transactions" | "transfers" | "cardPayments">;

/**
 * Saldo de cada conta = saldo inicial + receitas recebidas − despesas pagas
 * (fora do cartão) ± transferências − pagamentos de fatura.
 * Lançamentos pendentes não alteram o saldo. Com `asOf`, considera apenas
 * movimentos até aquela data.
 */
export function accountBalances(data: BalanceInput, asOf?: ISODate): Map<string, number> {
  const cents = new Map<string, number>();
  for (const a of data.accounts) cents.set(a.id, toCents(a.initial_balance));
  const add = (id: string | null, v: number) => {
    if (!id || !cents.has(id)) return;
    cents.set(id, cents.get(id)! + v);
  };
  const within = (d: ISODate) => !asOf || d <= asOf;

  for (const t of data.transactions) {
    if (t.status !== "paid" || t.card_id || !within(t.date)) continue;
    add(t.account_id, t.kind === "income" ? toCents(t.amount) : -toCents(t.amount));
  }
  for (const tr of data.transfers) {
    if (!within(tr.date)) continue;
    add(tr.from_account_id, -toCents(tr.amount));
    add(tr.to_account_id, toCents(tr.amount));
  }
  for (const p of data.cardPayments) {
    if (!within(p.date)) continue;
    add(p.account_id, -toCents(p.amount));
  }
  const out = new Map<string, number>();
  for (const [id, c] of cents) out.set(id, fromCents(c));
  return out;
}

export function totalBalance(data: BalanceInput, asOf?: ISODate): number {
  return sumMoney([...accountBalances(data, asOf).values()]);
}

export function goalSaved(goalId: string, contributions: GoalContribution[]): number {
  return sumMoney(contributions.filter((c) => c.goal_id === goalId).map((c) => c.amount));
}

/** Total guardado = saldo em poupança/investimentos + valores acumulados em metas ativas. */
export function savedTotal(
  data: BalanceInput & Pick<FinanceData, "goals" | "contributions">,
): { total: number; inAccounts: number; inGoals: number } {
  const balances = accountBalances(data);
  const inAccounts = sumMoney(
    data.accounts.filter((a) => SAVINGS_ACCOUNT_TYPES.includes(a.type)).map((a) => balances.get(a.id) ?? 0),
  );
  const inGoals = sumMoney(
    data.goals.filter((g) => !g.archived).map((g) => Math.max(0, goalSaved(g.id, data.contributions))),
  );
  return { total: sumMoney([inAccounts, inGoals]), inAccounts, inGoals };
}

// ---------------------------------------------------------------------------
// Resumos de período
// ---------------------------------------------------------------------------

export const inRange = (date: ISODate, from: ISODate, to: ISODate) => date >= from && date <= to;

export interface PeriodSummary {
  income: number;
  incomePending: number;
  expense: number;
  expensePending: number;
  result: number;
  /** Despesas ÷ receitas (0 quando não há receita). */
  committedRatio: number | null;
  /** (Receitas − despesas) ÷ receitas. */
  savingsRate: number | null;
  count: number;
}

/**
 * Receitas e despesas pelo regime de competência (data do lançamento),
 * incluindo pendentes e compras no cartão.
 */
export function summarizePeriod(transactions: Transaction[], from: ISODate, to: ISODate): PeriodSummary {
  let income = 0, incomePending = 0, expense = 0, expensePending = 0, count = 0;
  for (const t of transactions) {
    if (!inRange(t.date, from, to)) continue;
    count++;
    const c = toCents(t.amount);
    if (t.kind === "income") {
      income += c;
      if (t.status === "pending") incomePending += c;
    } else {
      expense += c;
      if (t.status === "pending" && !t.card_id) expensePending += c;
    }
  }
  return {
    income: fromCents(income),
    incomePending: fromCents(incomePending),
    expense: fromCents(expense),
    expensePending: fromCents(expensePending),
    result: fromCents(income - expense),
    committedRatio: income > 0 ? expense / income : null,
    savingsRate: income > 0 ? (income - expense) / income : null,
    count,
  };
}

export function summarizeMonth(transactions: Transaction[], key: string): PeriodSummary {
  return summarizePeriod(transactions, `${key}-01`, monthEnd(key));
}

/** Variação percentual de `current` em relação a `previous` (null se não houver base). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / Math.abs(previous);
}

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  color: string;
  icon: string;
  total: number;
  share: number;
  count: number;
}

export function categoryBreakdown(
  transactions: Transaction[],
  categories: Category[],
  kind: Kind,
  from: ISODate,
  to: ISODate,
): CategoryTotal[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const acc = new Map<string, { cents: number; count: number }>();
  let total = 0;
  for (const t of transactions) {
    if (t.kind !== kind || !inRange(t.date, from, to)) continue;
    const key = t.category_id && byId.has(t.category_id) ? t.category_id : "__none__";
    const cur = acc.get(key) ?? { cents: 0, count: 0 };
    cur.cents += toCents(t.amount);
    cur.count++;
    acc.set(key, cur);
    total += toCents(t.amount);
  }
  return [...acc.entries()]
    .map(([key, v]) => {
      const cat = key === "__none__" ? null : byId.get(key)!;
      return {
        categoryId: cat?.id ?? null,
        name: cat?.name ?? "Sem categoria",
        color: cat?.color ?? "#71717a",
        icon: cat?.icon ?? "circle",
        total: fromCents(v.cents),
        share: total > 0 ? v.cents / total : 0,
        count: v.count,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface MonthPoint {
  month: string;
  income: number;
  expense: number;
  result: number;
  /** Saldo somado de todas as contas no fim do mês. */
  balance: number;
  savingsRate: number | null;
}

export function monthlyHistory(data: BalanceInput, months: string[]): MonthPoint[] {
  return months.map((m) => {
    const s = summarizeMonth(data.transactions, m);
    return {
      month: m,
      income: s.income,
      expense: s.expense,
      result: s.result,
      balance: totalBalance(data, monthEnd(m)),
      savingsRate: s.savingsRate,
    };
  });
}

export function lastMonths(endKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(endKey, i - count + 1));
}

// ---------------------------------------------------------------------------
// Cartões de crédito e faturas
// ---------------------------------------------------------------------------

const clampDay = (year: number, month1: number, day: number) => Math.min(day, daysInMonth(year, month1));
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Mês (YYYY-MM) da fatura em que uma compra cai, identificado pelo mês de
 * VENCIMENTO. Compras feitas no dia do fechamento ou depois vão para a
 * fatura seguinte.
 */
export function invoiceMonthFor(date: ISODate, card: Pick<CreditCard, "closing_day" | "due_day">): string {
  const [y, m, d] = date.split("-").map(Number);
  const closingThisMonth = clampDay(y, m, card.closing_day);
  let closeKey = `${y}-${String(m).padStart(2, "0")}`;
  if (d >= closingThisMonth) closeKey = shiftMonth(closeKey, 1);
  return card.due_day > card.closing_day ? closeKey : shiftMonth(closeKey, 1);
}

/** Datas de fechamento e vencimento da fatura com vencimento em `dueKey`. */
export function invoiceDates(dueKey: string, card: Pick<CreditCard, "closing_day" | "due_day">) {
  const [dy, dm] = dueKey.split("-").map(Number);
  const dueDate = ymd(dy, dm, clampDay(dy, dm, card.due_day));
  const closeKey = card.due_day > card.closing_day ? dueKey : shiftMonth(dueKey, -1);
  const [cy, cm] = closeKey.split("-").map(Number);
  const closingDate = ymd(cy, cm, clampDay(cy, cm, card.closing_day));
  const prevKey = shiftMonth(closeKey, -1);
  const [py, pm] = prevKey.split("-").map(Number);
  const periodStart = ymd(py, pm, clampDay(py, pm, card.closing_day));
  /** Compras de periodStart (inclusive) até closingDate (exclusive). */
  return { dueDate, closingDate, periodStart, periodEnd: addDays(closingDate, -1) };
}

export type InvoiceStatus = "open" | "closed" | "paid" | "partial" | "overdue" | "empty";

export interface Invoice {
  cardId: string;
  month: string;
  dueDate: ISODate;
  closingDate: ISODate;
  periodStart: ISODate;
  periodEnd: ISODate;
  total: number;
  paid: number;
  remaining: number;
  status: InvoiceStatus;
  purchases: Transaction[];
  payments: CardPayment[];
}

export function invoiceStatus(inv: Pick<Invoice, "total" | "paid" | "dueDate" | "closingDate">, today: ISODate): InvoiceStatus {
  const remaining = toCents(inv.total) - toCents(inv.paid);
  if (toCents(inv.total) === 0 && toCents(inv.paid) === 0) return "empty";
  if (remaining <= 0) return "paid";
  if (today > inv.dueDate) return "overdue";
  if (toCents(inv.paid) > 0) return "partial";
  if (today >= inv.closingDate) return "closed";
  return "open";
}

/** Todas as faturas de um cartão (com compras ou pagamentos), da mais nova para a mais antiga. */
export function buildInvoices(
  card: CreditCard,
  transactions: Transaction[],
  payments: CardPayment[],
  today: ISODate,
): Invoice[] {
  const groups = new Map<string, { purchases: Transaction[]; payments: CardPayment[] }>();
  const get = (k: string) => {
    if (!groups.has(k)) groups.set(k, { purchases: [], payments: [] });
    return groups.get(k)!;
  };
  for (const t of transactions) if (t.card_id === card.id) get(invoiceMonthFor(t.date, card)).purchases.push(t);
  for (const p of payments) if (p.card_id === card.id) get(monthKey(p.reference_month)).payments.push(p);
  // A fatura atual sempre aparece, mesmo vazia.
  get(currentInvoiceMonth(card, today));

  return [...groups.entries()]
    .map(([month, g]) => {
      const dates = invoiceDates(month, card);
      const total = sumMoney(g.purchases.map((t) => t.amount));
      const paid = sumMoney(g.payments.map((p) => p.amount));
      const inv = { total, paid, ...dates };
      return {
        cardId: card.id,
        month,
        ...dates,
        total,
        paid,
        remaining: Math.max(0, fromCents(toCents(total) - toCents(paid))),
        status: invoiceStatus(inv, today),
        purchases: g.purchases.sort((a, b) => b.date.localeCompare(a.date)),
        payments: g.payments.sort((a, b) => b.date.localeCompare(a.date)),
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
}

/** Fatura que está recebendo compras hoje. */
export const currentInvoiceMonth = (card: Pick<CreditCard, "closing_day" | "due_day">, today: ISODate) =>
  invoiceMonthFor(today, card);

/**
 * Limite utilizado = todas as compras (inclusive parcelas futuras) − pagamentos.
 * O limite disponível nunca passa do limite total.
 */
export function cardLimit(card: CreditCard, transactions: Transaction[], payments: CardPayment[]) {
  const purchases = sumMoney(transactions.filter((t) => t.card_id === card.id).map((t) => t.amount));
  const paid = sumMoney(payments.filter((p) => p.card_id === card.id).map((p) => p.amount));
  const used = Math.max(0, fromCents(toCents(purchases) - toCents(paid)));
  const available = fromCents(toCents(card.limit_amount) - toCents(used));
  return { used, available, ratio: card.limit_amount > 0 ? used / card.limit_amount : 0 };
}

/** Divide um valor em N parcelas; os centavos que sobram vão para a primeira. */
export function splitInstallments(total: number, n: number): number[] {
  const cents = toCents(total);
  const base = Math.floor(cents / n);
  const rest = cents - base * n;
  return Array.from({ length: n }, (_, i) => fromCents(base + (i === 0 ? rest : 0)));
}

// ---------------------------------------------------------------------------
// Orçamento
// ---------------------------------------------------------------------------

export type BudgetLevel = "ok" | "warning" | "danger" | "over";

export function budgetLevel(ratio: number): BudgetLevel {
  if (ratio > 1) return "over";
  if (ratio >= BUDGET_THRESHOLDS.danger) return "danger";
  if (ratio >= BUDGET_THRESHOLDS.warning) return "warning";
  return "ok";
}

export interface BudgetStatus {
  budget: Budget;
  category: Category | undefined;
  spent: number;
  remaining: number;
  ratio: number;
  level: BudgetLevel;
}

export function budgetStatuses(budgets: Budget[], categories: Category[], transactions: Transaction[], key: string): BudgetStatus[] {
  const from = `${key}-01`;
  const to = monthEnd(key);
  const spentByCat = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind !== "expense" || !t.category_id || !inRange(t.date, from, to)) continue;
    spentByCat.set(t.category_id, (spentByCat.get(t.category_id) ?? 0) + toCents(t.amount));
  }
  const byId = new Map(categories.map((c) => [c.id, c]));
  return budgets
    .map((b) => {
      const spent = fromCents(spentByCat.get(b.category_id) ?? 0);
      const ratio = b.amount > 0 ? spent / b.amount : 0;
      return {
        budget: b,
        category: byId.get(b.category_id),
        spent,
        remaining: fromCents(toCents(b.amount) - toCents(spent)),
        ratio,
        level: budgetLevel(ratio),
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

// ---------------------------------------------------------------------------
// Contas recorrentes
// ---------------------------------------------------------------------------

export function nextDueDate(date: ISODate, frequency: Frequency, anchorDay: number): ISODate {
  if (frequency === "weekly") return addDays(date, 7);
  if (frequency === "monthly") return addMonths(date, 1, anchorDay);
  return addMonths(date, 12, anchorDay);
}

export type BillState = "overdue" | "due_soon" | "upcoming" | "inactive";

export function billState(bill: RecurringBill, today: ISODate, soonDays = DUE_SOON_DAYS): BillState {
  if (!bill.active) return "inactive";
  if (bill.next_due_date < today) return "overdue";
  if (diffDays(bill.next_due_date, today) <= soonDays) return "due_soon";
  return "upcoming";
}

/** Ocorrências de uma conta recorrente entre `from` e `to` (a partir do próximo vencimento). */
export function billOccurrences(bill: RecurringBill, from: ISODate, to: ISODate): ISODate[] {
  if (!bill.active) return [];
  const out: ISODate[] = [];
  let d = bill.next_due_date;
  for (let i = 0; d <= to && i < 400; i++) {
    if (d >= from) out.push(d);
    d = nextDueDate(d, bill.frequency, bill.anchor_day);
  }
  return out;
}

/** Valor mensal equivalente de uma conta recorrente. */
export function monthlyEquivalent(bill: Pick<RecurringBill, "amount" | "frequency">): number {
  if (bill.frequency === "monthly") return bill.amount;
  if (bill.frequency === "yearly") return Math.round((bill.amount / 12) * 100) / 100;
  return Math.round(((bill.amount * 52) / 12) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------

export function goalProgress(goal: Goal, contributions: GoalContribution[], today: ISODate) {
  const saved = goalSaved(goal.id, contributions);
  const remaining = Math.max(0, fromCents(toCents(goal.target_amount) - toCents(saved)));
  const ratio = goal.target_amount > 0 ? Math.max(0, saved / goal.target_amount) : 0;
  let monthsLeft: number | null = null;
  let monthlyNeeded: number | null = null;
  let late = false;
  if (goal.deadline) {
    const [ty, tm] = today.split("-").map(Number);
    const [gy, gm] = goal.deadline.split("-").map(Number);
    monthsLeft = (gy - ty) * 12 + (gm - tm);
    late = goal.deadline < today && remaining > 0;
    if (remaining > 0) monthlyNeeded = Math.ceil((remaining / Math.max(1, monthsLeft)) * 100) / 100;
  }
  return { saved, remaining, ratio, monthsLeft, monthlyNeeded, late, done: remaining === 0 };
}

// ---------------------------------------------------------------------------
// Notificações
// ---------------------------------------------------------------------------

export interface AppNotification {
  id: string;
  level: "danger" | "warning" | "info";
  title: string;
  description: string;
  href: string;
  date?: ISODate;
}

export function buildNotifications(data: FinanceData, today: ISODate): AppNotification[] {
  const out: AppNotification[] = [];
  const soonLimit = addDays(today, DUE_SOON_DAYS);

  for (const b of data.bills) {
    const s = billState(b, today);
    if (s === "overdue")
      out.push({ id: `bill-${b.id}`, level: "danger", title: `${b.name} está atrasada`, description: `Venceu em ${formatDate(b.next_due_date)}`, href: "/recorrentes", date: b.next_due_date });
    else if (s === "due_soon")
      out.push({ id: `bill-${b.id}`, level: "warning", title: `${b.name} vence em breve`, description: `Vencimento em ${formatDate(b.next_due_date)}`, href: "/recorrentes", date: b.next_due_date });
  }

  for (const t of data.transactions) {
    if (t.kind !== "expense" || t.status !== "pending" || t.card_id) continue;
    if (t.date < today)
      out.push({ id: `tx-${t.id}`, level: "danger", title: `${t.description} está pendente`, description: `Venceu em ${formatDate(t.date)}`, href: "/despesas?status=pending", date: t.date });
    else if (t.date <= soonLimit)
      out.push({ id: `tx-${t.id}`, level: "warning", title: `${t.description} a pagar`, description: `Vence em ${formatDate(t.date)}`, href: "/despesas?status=pending", date: t.date });
  }

  for (const card of data.cards) {
    if (card.archived) continue;
    for (const inv of buildInvoices(card, data.transactions, data.cardPayments, today)) {
      if (inv.remaining <= 0) continue;
      if (inv.status === "overdue")
        out.push({ id: `inv-${card.id}-${inv.month}`, level: "danger", title: `Fatura ${card.name} vencida`, description: `Vencimento em ${formatDate(inv.dueDate)}`, href: `/cartoes?card=${card.id}`, date: inv.dueDate });
      else if (inv.status !== "open" && inv.dueDate <= soonLimit)
        out.push({ id: `inv-${card.id}-${inv.month}`, level: "warning", title: `Fatura ${card.name} a vencer`, description: `Vencimento em ${formatDate(inv.dueDate)}`, href: `/cartoes?card=${card.id}`, date: inv.dueDate });
    }
  }

  for (const s of budgetStatuses(data.budgets, data.categories, data.transactions, monthKey(today))) {
    if (s.level === "ok") continue;
    const name = s.category?.name ?? "Categoria";
    const pctText = `${Math.round(s.ratio * 100)}% do orçamento usado`;
    if (s.level === "over") out.push({ id: `bud-${s.budget.id}`, level: "danger", title: `Orçamento de ${name} ultrapassado`, description: pctText, href: "/orcamento" });
    else if (s.level === "danger") out.push({ id: `bud-${s.budget.id}`, level: "warning", title: `${name} chegou a 90% do orçamento`, description: pctText, href: "/orcamento" });
    else out.push({ id: `bud-${s.budget.id}`, level: "info", title: `${name} chegou a 70% do orçamento`, description: pctText, href: "/orcamento" });
  }

  const rank = { danger: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || (a.date ?? "").localeCompare(b.date ?? ""));
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function accountName(accounts: Account[], id: string | null) {
  return accounts.find((a) => a.id === id)?.name ?? "—";
}

export function transfersForAccount(transfers: Transfer[], accountId: string) {
  return transfers.filter((t) => t.from_account_id === accountId || t.to_account_id === accountId);
}
