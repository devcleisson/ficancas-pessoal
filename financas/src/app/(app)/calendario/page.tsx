"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CreditCard, Plus, Repeat } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { MonthSwitcher } from "@/components/month-switcher";
import { EmptyState } from "@/components/empty-state";
import { CategoryIcon } from "@/components/category-icon";
import { Money, useMoneyFormat } from "@/components/money";
import { useFinance } from "@/lib/store/finance-store";
import { useTransactionActions } from "@/components/transactions/quick-add";
import { billOccurrences, buildInvoices } from "@/lib/finance";
import { capitalize, daysInMonth, formatDate, monthEnd, monthKey, sumMoney, todayISO, weekdayShort } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

type Item =
  | { type: "tx"; tx: Transaction }
  | { type: "bill"; id: string; name: string; amount: number }
  | { type: "invoice"; id: string; name: string; amount: number; cardId: string };

export default function CalendarPage() {
  const { data } = useFinance();
  const { edit, open } = useTransactionActions();
  const { compact } = useMoneyFormat();
  const today = todayISO();
  const [month, setMonth] = useState(monthKey(today));
  const [selected, setSelected] = useState<string>(today);

  const byDay = useMemo(() => {
    const from = `${month}-01`;
    const to = monthEnd(month);
    const map = new Map<string, Item[]>();
    const push = (d: string, it: Item) => map.set(d, [...(map.get(d) ?? []), it]);
    for (const t of data.transactions) if (t.date >= from && t.date <= to) push(t.date, { type: "tx", tx: t });
    for (const b of data.bills) for (const d of billOccurrences(b, from, to)) push(d, { type: "bill", id: `${b.id}-${d}`, name: b.name, amount: b.amount });
    for (const c of data.cards.filter((x) => !x.archived)) {
      for (const inv of buildInvoices(c, data.transactions, data.cardPayments, today)) {
        if (inv.dueDate >= from && inv.dueDate <= to && inv.total > 0) push(inv.dueDate, { type: "invoice", id: `${c.id}-${inv.month}`, name: `Fatura ${c.name}`, amount: inv.remaining > 0 ? inv.remaining : inv.total, cardId: c.id });
      }
    }
    return map;
  }, [data, month, today]);

  const [y, m] = month.split("-").map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const total = daysInMonth(y, m);
  const cells = [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: total }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const selectedItems = byDay.get(selected) ?? [];

  const dayTotals = (items: Item[]) => ({
    inc: sumMoney(items.filter((i) => i.type === "tx" && i.tx.kind === "income").map((i) => (i as { tx: Transaction }).tx.amount)),
    exp: sumMoney(items.filter((i) => i.type === "tx" && i.tx.kind === "expense").map((i) => (i as { tx: Transaction }).tx.amount)),
    due: items.some((i) => i.type !== "tx"),
  });

  return (
    <div className="grid gap-6">
      <PageHeader title="Calendário financeiro" description="Receitas, despesas, contas e faturas por dia." actions={<MonthSwitcher value={month} onChange={(k) => { setMonth(k); setSelected(`${k}-01`); }} />} />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="p-3 sm:p-4">
          <div className="grid grid-cols-7 gap-1 pb-2 text-center text-[11px] font-medium text-muted-foreground uppercase">
            {Array.from({ length: 7 }, (_, i) => <div key={i}>{weekdayShort(i)}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const items = byDay.get(d) ?? [];
              const t = dayTotals(items);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelected(d)}
                  aria-pressed={selected === d}
                  aria-label={`Dia ${Number(d.slice(8))}, ${items.length} itens`}
                  className={cn(
                    "flex min-h-16 flex-col items-stretch rounded-lg border p-1.5 text-left transition-colors sm:min-h-24",
                    selected === d ? "border-primary/60 bg-primary/8" : "border-transparent bg-muted/30 hover:bg-muted/70",
                  )}
                >
                  <span className={cn("flex size-6 items-center justify-center rounded-full text-xs", d === today && "bg-primary font-semibold text-primary-foreground")}>{Number(d.slice(8))}</span>
                  <span className="mt-auto hidden flex-col gap-0.5 text-[10px] leading-tight tabular sm:flex">
                    {t.inc > 0 && <span className="truncate text-income">+{compact(t.inc)}</span>}
                    {t.exp > 0 && <span className="truncate text-expense">−{compact(t.exp)}</span>}
                    {t.due && <span className="truncate text-warning">vencimento</span>}
                  </span>
                  <span className="mt-auto flex gap-0.5 sm:hidden">
                    {t.inc > 0 && <span className="size-1.5 rounded-full bg-income" />}
                    {t.exp > 0 && <span className="size-1.5 rounded-full bg-expense" />}
                    {t.due && <span className="size-1.5 rounded-full bg-warning" />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 px-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-income" /> Receitas</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-expense" /> Despesas</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning" /> Contas e faturas a vencer</span>
          </div>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <div>
              <CardTitle>{capitalize(new Date(`${selected}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }))}</CardTitle>
              <CardDescription>{formatDate(selected)}</CardDescription>
            </div>
            <Button size="icon-sm" variant="outline" aria-label="Lançar neste dia" onClick={() => open({ kind: "expense", defaults: { date: selected } })}><Plus /></Button>
          </CardHeader>
          <CardContent className="pt-3">
            {selectedItems.length === 0 ? (
              <EmptyState icon={CalendarDays} title="Nada neste dia" className="py-8" />
            ) : (
              <ul className="grid gap-1">
                {selectedItems.map((it) => {
                  if (it.type === "tx") {
                    const t = it.tx;
                    const cat = data.categories.find((c) => c.id === t.category_id);
                    return (
                      <li key={t.id}>
                        <button type="button" onClick={() => edit(t)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/60">
                          <CategoryIcon icon={cat?.icon ?? "circle"} color={cat?.color ?? "#71717a"} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{t.description}</span>
                            {!t.card_id && t.status === "pending" && <Badge variant="warning">Pendente</Badge>}
                          </span>
                          <Money value={t.kind === "income" ? t.amount : -t.amount} tone={t.kind === "income" ? "income" : "expense"} sign className="text-sm" />
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li key={it.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-warning/12 text-warning">{it.type === "bill" ? <Repeat className="size-3.5" /> : <CreditCard className="size-3.5" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{it.name}</span>
                        <span className="text-xs text-muted-foreground">{it.type === "bill" ? "Conta recorrente" : "Vencimento da fatura"}</span>
                      </span>
                      <Money value={it.amount} className="text-sm" />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
