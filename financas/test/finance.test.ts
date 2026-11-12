import { describe, it, expect } from "vitest";
import { addMonths, formatBRL, formatDate, isValidISODate, parseMoney, sumMoney } from "@/lib/format";
import {
  accountBalances,
  billState,
  budgetStatuses,
  buildInvoices,
  buildNotifications,
  cardLimit,
  categoryBreakdown,
  goalProgress,
  invoiceDates,
  invoiceMonthFor,
  monthlyHistory,
  nextDueDate,
  savedTotal,
  splitInstallments,
  summarizeMonth,
} from "@/lib/finance";
import { validateTransaction } from "@/lib/validation";
import type { Account, CardPayment, Category, CreditCard, FinanceData, RecurringBill, Transaction } from "@/lib/types";

let seq = 0;
const id = () => `id-${++seq}`;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: id(), user_id: "u", kind: "expense", description: "x", amount: 10, date: "2026-11-10",
  category_id: null, account_id: "acc1", card_id: null, payment_method: "pix", status: "paid",
  expense_type: null, source: null, notes: null, installment_group: null, installment_number: null,
  installment_total: null, recurring_bill_id: null, created_at: "", updated_at: "", ...p,
});
const account = (p: Partial<Account>): Account => ({
  id: "acc1", user_id: "u", name: "Conta", type: "checking", institution: null, initial_balance: 0,
  color: "#000000", archived: false, created_at: "", ...p,
});
const card: CreditCard = {
  id: "card1", user_id: "u", name: "Nubank", institution: null, limit_amount: 1000, closing_day: 5,
  due_day: 12, color: "#000000", default_account_id: null, archived: false, created_at: "",
};
const empty: FinanceData = {
  profile: null, categories: [], accounts: [], cards: [], transactions: [], transfers: [],
  cardPayments: [], budgets: [], bills: [], goals: [], contributions: [],
};

describe("formatação brasileira", () => {
  it("formata reais", () => {
    expect(formatBRL(1234.5)).toBe("R$ 1.234,50");
    expect(formatBRL(-0.1)).toBe("-R$ 0,10");
    expect(formatDate("2026-11-03")).toBe("03/11/2026");
  });

  it("interpreta valores digitados", () => {
    expect(parseMoney("1.234,56")).toBe(1234.56);
    expect(parseMoney("1234,5")).toBe(1234.5);
    expect(parseMoney("R$ 10")).toBe(10);
    expect(parseMoney("12.5")).toBe(12.5);
    expect(parseMoney("1.234")).toBe(1234);
    expect(parseMoney("1,234.56")).toBe(1234.56);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("1,2,3")).toBeNull();
    expect(parseMoney("10,123")).toBeNull();
  });

  it("soma sem erro de ponto flutuante", () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });

  it("valida datas", () => {
    expect(isValidISODate("2026-02-29")).toBe(false);
    expect(isValidISODate("2028-02-29")).toBe(true);
    expect(isValidISODate("2026-13-01")).toBe(false);
  });

  it("soma meses respeitando fim de mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-02-28", 1, 31)).toBe("2026-03-31");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
});

describe("saldos", () => {
  const data = {
    accounts: [account({ initial_balance: 1000 }), account({ id: "acc2", type: "savings", initial_balance: 0 })],
    transactions: [
      tx({ kind: "income", amount: 3000 }),
      tx({ amount: 200 }),
      tx({ amount: 50, status: "pending" }), // pendente não afeta saldo
      tx({ amount: 300, account_id: null, card_id: "card1", payment_method: "credit" }), // cartão não afeta saldo
    ],
    transfers: [{ id: "t", user_id: "u", from_account_id: "acc1", to_account_id: "acc2", amount: 500, date: "2026-11-11", description: null, created_at: "" }],
    cardPayments: [{ id: "p", user_id: "u", card_id: "card1", reference_month: "2026-12-01", amount: 100, date: "2026-11-12", account_id: "acc1", created_at: "" }] as CardPayment[],
  };

  it("calcula saldo por conta", () => {
    const b = accountBalances(data);
    expect(b.get("acc1")).toBe(1000 + 3000 - 200 - 500 - 100);
    expect(b.get("acc2")).toBe(500);
  });

  it("considera a data de corte", () => {
    expect(accountBalances(data, "2026-11-10").get("acc1")).toBe(3800);
  });

  it("total guardado soma poupança e metas", () => {
    const s = savedTotal({
      ...data,
      goals: [{ id: "g", user_id: "u", name: "Viagem", target_amount: 5000, deadline: null, color: "#000000", icon: "target", archived: false, created_at: "" }],
      contributions: [{ id: "c", user_id: "u", goal_id: "g", amount: 250, date: "2026-11-01", note: null, created_at: "" }],
    });
    expect(s).toEqual({ total: 750, inAccounts: 500, inGoals: 250 });
  });
});

describe("resumo mensal", () => {
  const txs = [
    tx({ kind: "income", amount: 5000, date: "2026-11-05" }),
    tx({ kind: "income", amount: 500, date: "2026-11-20", status: "pending" }),
    tx({ amount: 1000, date: "2026-11-02" }),
    tx({ amount: 250, date: "2026-11-30", status: "pending" }),
    tx({ amount: 999, date: "2026-10-31" }),
  ];
  it("soma receitas, despesas e percentual comprometido", () => {
    const s = summarizeMonth(txs, "2026-11");
    expect(s.income).toBe(5500);
    expect(s.incomePending).toBe(500);
    expect(s.expense).toBe(1250);
    expect(s.result).toBe(4250);
    expect(s.committedRatio).toBeCloseTo(1250 / 5500);
  });

  it("agrupa por categoria", () => {
    const cats: Category[] = [{ id: "c1", user_id: "u", name: "Mercado", kind: "expense", color: "#000000", icon: "x", is_default: true, created_at: "" }];
    const r = categoryBreakdown([tx({ category_id: "c1", amount: 30 }), tx({ category_id: "c1", amount: 20 }), tx({ amount: 50 })], cats, "expense", "2026-11-01", "2026-11-30");
    expect(r[0].total).toBe(50);
    expect(r.map((x) => x.name).sort()).toEqual(["Mercado", "Sem categoria"]);
    expect(r[0].share).toBe(0.5);
  });

  it("gera histórico com saldo no fim de cada mês", () => {
    const h = monthlyHistory(
      { accounts: [account({ initial_balance: 100 })], transfers: [], cardPayments: [], transactions: [tx({ kind: "income", amount: 50, date: "2026-10-10" }), tx({ amount: 30, date: "2026-11-10" })] },
      ["2026-10", "2026-11"],
    );
    expect(h.map((p) => p.balance)).toEqual([150, 120]);
  });
});

describe("cartão de crédito", () => {
  it("define a fatura de cada compra pelo fechamento", () => {
    // fecha dia 5, vence dia 12
    expect(invoiceMonthFor("2026-11-04", card)).toBe("2026-11");
    expect(invoiceMonthFor("2026-11-05", card)).toBe("2026-12");
    expect(invoiceMonthFor("2026-12-31", card)).toBe("2027-01");
    // fecha dia 28, vence dia 5 do mês seguinte
    const c2 = { closing_day: 28, due_day: 5 };
    expect(invoiceMonthFor("2026-11-27", c2)).toBe("2026-12");
    expect(invoiceMonthFor("2026-11-28", c2)).toBe("2027-01");
    // fechamento dia 31 em fevereiro usa o último dia
    expect(invoiceMonthFor("2026-02-28", { closing_day: 31, due_day: 10 })).toBe("2026-04");
  });

  it("calcula datas da fatura", () => {
    expect(invoiceDates("2026-12", card)).toEqual({ dueDate: "2026-12-12", closingDate: "2026-12-05", periodStart: "2026-11-05", periodEnd: "2026-12-04" });
    expect(invoiceDates("2027-01", { closing_day: 28, due_day: 5 }).closingDate).toBe("2026-12-28");
  });

  it("monta faturas, status e limite disponível", () => {
    const txs = [
      tx({ card_id: "card1", account_id: null, payment_method: "credit", amount: 300, date: "2026-10-20" }), // fatura nov
      tx({ card_id: "card1", account_id: null, payment_method: "credit", amount: 200, date: "2026-11-06" }), // fatura dez
    ];
    const pays: CardPayment[] = [{ id: "p", user_id: "u", card_id: "card1", reference_month: "2026-11-01", amount: 300, date: "2026-11-10", account_id: "acc1", created_at: "" }];
    const inv = buildInvoices(card, txs, pays, "2026-11-12");
    expect(inv.map((i) => [i.month, i.total, i.status])).toEqual([
      ["2026-12", 200, "open"],
      ["2026-11", 300, "paid"],
    ]);
    expect(cardLimit(card, txs, pays)).toMatchObject({ used: 200, available: 800 });
    const late = buildInvoices(card, txs, [], "2026-11-13");
    expect(late.find((i) => i.month === "2026-11")!.status).toBe("overdue");
  });

  it("divide parcelas sem perder centavos", () => {
    const p = splitInstallments(100, 3);
    expect(p).toEqual([33.34, 33.33, 33.33]);
    expect(sumMoney(p)).toBe(100);
  });
});

describe("orçamento", () => {
  it("dispara níveis de alerta em 70%, 90% e acima do limite", () => {
    const cats: Category[] = ["a", "b", "c", "d"].map((c) => ({ id: c, user_id: "u", name: c, kind: "expense", color: "#000000", icon: "x", is_default: false, created_at: "" }));
    const budgets = cats.map((c) => ({ id: `b-${c.id}`, user_id: "u", category_id: c.id, amount: 100, created_at: "" }));
    const txs = [tx({ category_id: "a", amount: 50 }), tx({ category_id: "b", amount: 70 }), tx({ category_id: "c", amount: 90 }), tx({ category_id: "d", amount: 100.01 })];
    const levels = Object.fromEntries(budgetStatuses(budgets, cats, txs, "2026-11").map((s) => [s.category!.id, s.level]));
    expect(levels).toEqual({ a: "ok", b: "warning", c: "danger", d: "over" });
  });
});

describe("recorrentes", () => {
  const bill = (p: Partial<RecurringBill>): RecurringBill => ({
    id: id(), user_id: "u", name: "Internet", amount: 100, category_id: null, frequency: "monthly",
    next_due_date: "2026-11-20", anchor_day: 20, account_id: null, payment_method: "boleto", active: true,
    notes: null, created_at: "", ...p,
  });
  it("avança vencimentos", () => {
    expect(nextDueDate("2026-11-20", "weekly", 20)).toBe("2026-11-27");
    expect(nextDueDate("2026-01-31", "monthly", 31)).toBe("2026-02-28");
    expect(nextDueDate("2026-02-28", "monthly", 31)).toBe("2026-03-31");
    expect(nextDueDate("2026-11-20", "yearly", 20)).toBe("2027-11-20");
  });
  it("identifica atrasadas e próximas", () => {
    expect(billState(bill({ next_due_date: "2026-11-10" }), "2026-11-12")).toBe("overdue");
    expect(billState(bill({ next_due_date: "2026-11-15" }), "2026-11-12")).toBe("due_soon");
    expect(billState(bill({ next_due_date: "2026-12-15" }), "2026-11-12")).toBe("upcoming");
  });
  it("gera notificações", () => {
    const n = buildNotifications({ ...empty, bills: [bill({ next_due_date: "2026-11-01" })] }, "2026-11-12");
    expect(n[0]).toMatchObject({ level: "danger", href: "/recorrentes" });
  });
});

describe("metas", () => {
  it("calcula progresso e aporte mensal necessário", () => {
    const g = { id: "g", user_id: "u", name: "PC", target_amount: 6000, deadline: "2027-05-30", color: "#000000", icon: "x", archived: false, created_at: "" };
    const p = goalProgress(g, [{ id: "c", user_id: "u", goal_id: "g", amount: 1200, date: "2026-11-01", note: null, created_at: "" }], "2026-11-12");
    expect(p.ratio).toBeCloseTo(0.2);
    expect(p.monthsLeft).toBe(6);
    expect(p.monthlyNeeded).toBe(800);
  });
});

describe("validações de lançamento", () => {
  const base = { kind: "expense" as const, description: "Mercado", amount: 50, date: "2026-11-12", category_id: "c", account_id: "a", card_id: null, payment_method: "pix" as const, status: "paid" as const };
  it("aceita lançamento válido", () => {
    expect(validateTransaction(base)).toEqual({});
  });
  it("rejeita valores e campos inválidos", () => {
    expect(validateTransaction({ ...base, amount: 0 })).toHaveProperty("amount");
    expect(validateTransaction({ ...base, description: "  " })).toHaveProperty("description");
    expect(validateTransaction({ ...base, date: "2026-02-30" })).toHaveProperty("date");
    expect(validateTransaction({ ...base, account_id: null })).toHaveProperty("account_id");
    expect(validateTransaction({ ...base, payment_method: "credit", card_id: null, account_id: null })).toHaveProperty("card_id");
  });
});
