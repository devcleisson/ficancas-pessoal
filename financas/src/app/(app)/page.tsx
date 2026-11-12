"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, CheckCircle2, Gauge, Landmark, PiggyBank, Plus, Scale, TrendingDown, Wallet,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MonthSwitcher } from "@/components/month-switcher";
import { StatCard, Delta } from "@/components/stat-card";
import { Money } from "@/components/money";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState } from "@/components/empty-state";
import { BalanceChart, CategoryDonut, HistoryChart, IncomeExpenseChart } from "@/components/charts";
import { useFinance } from "@/lib/store/finance-store";
import { useTransactionActions } from "@/components/transactions/quick-add";
import {
  billState, buildInvoices, categoryBreakdown, lastMonths, monthlyHistory, percentChange, savedTotal, summarizeMonth, totalBalance,
} from "@/lib/finance";
import { addDays, formatDateShort, formatPercent, monthEnd, monthKey, relativeDay, shiftMonth, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { data } = useFinance();
  const { open } = useTransactionActions();
  const today = todayISO();
  const [month, setMonth] = useState(monthKey(today));

  const m = useMemo(() => {
    const cur = summarizeMonth(data.transactions, month);
    const prev = summarizeMonth(data.transactions, shiftMonth(month, -1));
    const months12 = lastMonths(month, 12);
    const history = monthlyHistory(data, months12);
    const categories = categoryBreakdown(data.transactions, data.categories, "expense", `${month}-01`, monthEnd(month));
    return {
      cur,
      prev,
      history,
      last6: history.slice(-6),
      categories,
      balance: totalBalance(data),
      saved: savedTotal(data),
      expenseChange: percentChange(cur.expense, prev.expense),
    };
  }, [data, month]);

  const recent = useMemo(
    () => data.transactions.filter((t) => t.date <= today).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)).slice(0, 8),
    [data.transactions, today],
  );

  const upcoming = useMemo(() => {
    const limit = addDays(today, 15);
    const items: { id: string; title: string; date: string; amount: number; href: string; overdue: boolean }[] = [];
    for (const b of data.bills) {
      const s = billState(b, today, 15);
      if (s === "overdue" || s === "due_soon") items.push({ id: `b${b.id}`, title: b.name, date: b.next_due_date, amount: b.amount, href: "/recorrentes", overdue: s === "overdue" });
    }
    for (const t of data.transactions) {
      if (t.kind === "expense" && t.status === "pending" && !t.card_id && t.date <= limit)
        items.push({ id: `t${t.id}`, title: t.description, date: t.date, amount: t.amount, href: "/despesas?status=pending", overdue: t.date < today });
    }
    for (const c of data.cards.filter((x) => !x.archived)) {
      for (const inv of buildInvoices(c, data.transactions, data.cardPayments, today)) {
        if (inv.remaining > 0 && inv.status !== "open" && inv.dueDate <= limit)
          items.push({ id: `i${c.id}${inv.month}`, title: `Fatura ${c.name}`, date: inv.dueDate, amount: inv.remaining, href: `/cartoes?card=${c.id}`, overdue: inv.status === "overdue" });
      }
    }
    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  }, [data, today]);

  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const name = data.profile?.full_name?.split(" ")[0];
  const isEmpty = data.transactions.length === 0;
  const committed = m.cur.committedRatio;

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()}{name ? `, ${name}` : ""}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
        </div>
        <MonthSwitcher value={month} onChange={setMonth} />
      </div>

      {isEmpty && <Onboarding />}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores do mês">
        <StatCard
          label="Saldo total disponível"
          icon={Wallet}
          tone="primary"
          value={<Money value={m.balance} tone={m.balance < 0 ? "expense" : "neutral"} />}
          footer={<Link href="/contas" className="hover:text-foreground">Em {data.accounts.filter((a) => !a.archived).length} conta(s) →</Link>}
        />
        <StatCard
          label="Receitas do mês"
          icon={ArrowUpRight}
          tone="income"
          value={<Money value={m.cur.income} tone="income" />}
          footer={m.cur.incomePending > 0 ? <>Inclui <Money value={m.cur.incomePending} /> a receber</> : <Delta ratio={percentChange(m.cur.income, m.prev.income)} />}
        />
        <StatCard
          label="Despesas do mês"
          icon={ArrowDownRight}
          tone="expense"
          value={<Money value={m.cur.expense} tone="expense" />}
          footer={<Delta ratio={m.expenseChange} invert />}
        />
        <StatCard
          label="Resultado do mês"
          icon={Scale}
          tone={m.cur.result >= 0 ? "income" : "expense"}
          value={<Money value={m.cur.result} tone="auto" sign />}
          footer={m.cur.savingsRate != null ? <>Taxa de economia de <b className="text-foreground">{formatPercent(m.cur.savingsRate)}</b></> : "Sem receitas no mês"}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Indicadores complementares">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-muted-foreground">Renda comprometida</p>
            <Gauge className="size-4 text-muted-foreground" />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight tabular">{committed == null ? "—" : formatPercent(committed)}</p>
          <Progress
            value={committed ?? 0}
            className="mt-3"
            indicatorClassName={cn(committed != null && committed >= 0.9 ? "bg-expense" : committed != null && committed >= 0.7 ? "bg-warning" : "bg-primary")}
          />
          <p className="mt-2 text-xs text-muted-foreground">Despesas ÷ receitas do mês</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-muted-foreground">Total guardado</p>
            <PiggyBank className="size-4 text-muted-foreground" />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight"><Money value={m.saved.total} /></p>
          <p className="mt-2 text-xs text-muted-foreground">
            <Money value={m.saved.inAccounts} /> em poupança/investimentos · <Money value={m.saved.inGoals} /> em metas
          </p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-muted-foreground">Gastos vs. mês anterior</p>
            <TrendingDown className="size-4 text-muted-foreground" />
          </div>
          <p className={cn("mt-3 text-2xl font-semibold tracking-tight tabular", m.expenseChange != null && (m.expenseChange > 0 ? "text-expense" : m.expenseChange < 0 ? "text-income" : ""))}>
            {m.expenseChange == null ? "—" : `${m.expenseChange > 0 ? "+" : ""}${formatPercent(m.expenseChange)}`}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            <Money value={m.cur.expense} /> agora · <Money value={m.prev.expense} /> no mês anterior
          </p>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Receitas x despesas</CardTitle>
              <CardDescription>Últimos 6 meses</CardDescription>
            </div>
            <Legend items={[["Receitas", "bg-income"], ["Despesas", "bg-expense"]]} />
          </CardHeader>
          <CardContent>
            <IncomeExpenseChart data={m.last6} />
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Gastos por categoria</CardTitle>
              <CardDescription>No mês selecionado</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {m.categories.length ? (
              <CategoryDonut items={m.categories} total={m.cur.expense} />
            ) : (
              <EmptyState icon={TrendingDown} title="Sem despesas neste mês" className="py-10" />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Evolução do saldo</CardTitle>
              <CardDescription>Saldo de todas as contas no fim de cada mês</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <BalanceChart data={m.history} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Histórico de 12 meses</CardTitle>
              <CardDescription>Receitas, despesas e resultado</CardDescription>
            </div>
            <Legend items={[["Receitas", "bg-income"], ["Despesas", "bg-expense"], ["Resultado", "bg-foreground"]]} />
          </CardHeader>
          <CardContent>
            <HistoryChart data={m.history} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Últimas movimentações</CardTitle>
              <CardDescription>Lançamentos mais recentes</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/movimentacoes">Ver todas <ArrowRight /></Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-3">
            {recent.length === 0 ? (
              <EmptyState icon={Landmark} title="Nenhuma movimentação ainda" description="Cadastre sua primeira receita ou despesa." className="py-8" />
            ) : (
              <ul className="grid gap-1">
                {recent.map((t) => {
                  const cat = t.category_id ? catById.get(t.category_id) : undefined;
                  return (
                    <li key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
                      <CategoryIcon icon={cat?.icon ?? "circle"} color={cat?.color ?? "#71717a"} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.description}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDateShort(t.date)} · {cat?.name ?? "Sem categoria"}
                          {!t.card_id && t.status === "pending" && <span className="text-warning"> · pendente</span>}
                        </p>
                      </div>
                      <Money value={t.kind === "income" ? t.amount : -t.amount} tone={t.kind === "income" ? "income" : "expense"} sign className="text-sm font-medium" />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Próximos vencimentos</CardTitle>
              <CardDescription>Próximos 15 dias e atrasados</CardDescription>
            </div>
            <CalendarClock className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-3">
            {upcoming.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nada para pagar" description="Nenhuma conta ou fatura vencendo nos próximos 15 dias." className="py-8" />
            ) : (
              <ul className="grid gap-1">
                {upcoming.map((u) => (
                  <li key={u.id}>
                    <Link href={u.href} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
                      <div className={cn("flex size-9 shrink-0 flex-col items-center justify-center rounded-lg text-[10px] leading-tight font-semibold", u.overdue ? "bg-expense/12 text-expense" : "bg-muted text-foreground")}>
                        <span>{u.date.slice(8)}</span>
                        <span className="font-normal uppercase opacity-70">{formatDateShort(u.date).split(" ")[1]}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{u.title}</p>
                        <p className={cn("text-xs", u.overdue ? "text-expense" : "text-muted-foreground")}>{u.overdue ? `Atrasada · ${relativeDay(u.date, today)}` : relativeDay(u.date, today)}</p>
                      </div>
                      <Money value={u.amount} className="text-sm font-medium" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <div className="flex justify-center gap-2 pb-2 sm:hidden">
        <Button variant="outline" onClick={() => open({ kind: "income" })}><Plus /> Receita</Button>
        <Button variant="outline" onClick={() => open({ kind: "expense" })}><Plus /> Despesa</Button>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="hidden gap-3 text-xs text-muted-foreground sm:flex">
      {items.map(([l, c]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", c)} />
          {l}
        </span>
      ))}
    </div>
  );
}

function Onboarding() {
  const { data } = useFinance();
  const { open } = useTransactionActions();
  const steps = [
    { done: data.accounts.some((a) => a.initial_balance !== 0) || data.accounts.length > 1, label: "Cadastre suas contas e o saldo atual de cada uma", href: "/contas" },
    { done: data.transactions.some((t) => t.kind === "income"), label: "Lance sua primeira receita", action: () => open({ kind: "income" }) },
    { done: data.transactions.some((t) => t.kind === "expense"), label: "Lance sua primeira despesa", action: () => open({ kind: "expense" }) },
    { done: data.budgets.length > 0, label: "Defina limites de gastos no orçamento", href: "/orcamento" },
  ];
  return (
    <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-primary/[0.07] to-transparent">
      <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <Badge variant="success" className="mb-2">Primeiros passos</Badge>
          <p className="text-lg font-semibold tracking-tight">Bem-vindo! Vamos montar seu painel.</p>
          <p className="mt-1 text-sm text-muted-foreground">Os indicadores e gráficos são calculados automaticamente a partir dos dados que você cadastrar.</p>
        </div>
        <ol className="grid gap-2 text-sm">
          {steps.map((s, i) => {
            const content = (
              <span className="flex items-center gap-2">
                {s.done ? <CheckCircle2 className="size-4 text-income" /> : <span className="flex size-4 items-center justify-center rounded-full border border-border text-[10px]">{i + 1}</span>}
                <span className={cn(s.done && "text-muted-foreground line-through")}>{s.label}</span>
              </span>
            );
            return (
              <li key={s.label}>
                {s.href ? <Link href={s.href} className="hover:text-primary">{content}</Link> : <button type="button" onClick={s.action} className="text-left hover:text-primary">{content}</button>}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
