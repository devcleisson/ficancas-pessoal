"use client";

import { useMemo, useState } from "react";
import { Check, CircleDashed, CreditCard, Filter, MoreHorizontal, Pencil, Repeat, Search, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { useFinance } from "@/lib/store/finance-store";
import { useTransactionActions } from "./quick-add";
import { PERIOD_LABEL, resolvePeriod, type PeriodPreset } from "./period";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { formatDate, formatDateShort, sumMoney } from "@/lib/format";
import type { Kind, PaymentMethod, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface TxFilters {
  search: string;
  preset: PeriodPreset;
  from: string;
  to: string;
  kind: "all" | Kind;
  categoryId: string;
  method: "all" | PaymentMethod;
  status: "all" | "paid" | "pending";
  expenseType: "all" | "fixed" | "variable";
  accountId: string;
}

export const defaultFilters = (over: Partial<TxFilters> = {}): TxFilters => ({
  search: "",
  preset: "this_month",
  from: "",
  to: "",
  kind: "all",
  categoryId: "all",
  method: "all",
  status: "all",
  expenseType: "all",
  accountId: "all",
  ...over,
});

const normalizeText = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterTransactions(txs: Transaction[], f: TxFilters) {
  const { from, to } = resolvePeriod(f.preset, { from: f.from, to: f.to });
  const q = normalizeText(f.search.trim());
  return txs
    .filter((t) => {
      if (t.date < from || t.date > to) return false;
      if (f.kind !== "all" && t.kind !== f.kind) return false;
      if (f.categoryId !== "all" && t.category_id !== f.categoryId) return false;
      if (f.method !== "all" && t.payment_method !== f.method) return false;
      if (f.status !== "all" && (t.card_id ? "paid" : t.status) !== f.status) return false;
      if (f.expenseType !== "all" && t.expense_type !== f.expenseType) return false;
      if (f.accountId !== "all" && t.account_id !== f.accountId && t.card_id !== f.accountId) return false;
      if (q) {
        const hay = normalizeText(`${t.description} ${t.notes ?? ""} ${t.source ?? ""} ${t.amount.toFixed(2).replace(".", ",")}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
}

export function TransactionFilters({
  filters,
  onChange,
  showKind = false,
  kind,
}: {
  filters: TxFilters;
  onChange: (f: TxFilters) => void;
  showKind?: boolean;
  kind?: Kind;
}) {
  const { data } = useFinance();
  const [open, setOpen] = useState(false);
  const set = <K extends keyof TxFilters>(k: K, v: TxFilters[K]) => onChange({ ...filters, [k]: v });
  const categories = data.categories.filter((c) => (kind ? c.kind === kind : filters.kind === "all" || c.kind === filters.kind));
  const activeCount = (["categoryId", "method", "status", "expenseType", "accountId"] as const).filter((k) => filters[k] !== "all").length + (showKind && filters.kind !== "all" ? 1 : 0);

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Buscar por descrição, observação ou valor"
            className="pl-9"
            aria-label="Buscar"
          />
        </div>
        <div className="flex gap-2">
          <Select value={filters.preset} onValueChange={(v) => set("preset", v as PeriodPreset)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Período">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABEL) as PeriodPreset[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant={open || activeCount ? "secondary" : "outline"} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <Filter />
            Filtros
            {activeCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{activeCount}</span>}
          </Button>
        </div>
      </div>

      {filters.preset === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">De</span>
          <Input type="date" className="w-auto" value={filters.from} onChange={(e) => set("from", e.target.value)} aria-label="Data inicial" />
          <span className="text-muted-foreground">até</span>
          <Input type="date" className="w-auto" value={filters.to} onChange={(e) => set("to", e.target.value)} aria-label="Data final" />
        </div>
      )}

      {open && (
        <div className="grid animate-rise gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-5">
          {showKind && (
            <FilterSelect label="Tipo" value={filters.kind} onChange={(v) => onChange({ ...filters, kind: v as TxFilters["kind"], categoryId: "all" })}
              options={[["all", "Receitas e despesas"], ["income", "Receitas"], ["expense", "Despesas"]]} />
          )}
          <FilterSelect label="Categoria" value={filters.categoryId} onChange={(v) => set("categoryId", v)}
            options={[["all", "Todas as categorias"], ...categories.map((c) => [c.id, c.name] as [string, string])]} />
          <FilterSelect label="Forma de pagamento" value={filters.method} onChange={(v) => set("method", v as TxFilters["method"])}
            options={[["all", "Todas as formas"], ...(Object.entries(PAYMENT_METHOD_LABEL) as [string, string][])]} />
          <FilterSelect label="Status" value={filters.status} onChange={(v) => set("status", v as TxFilters["status"])}
            options={[["all", "Todos os status"], ["paid", "Pago / recebido"], ["pending", "Pendente"]]} />
          {kind !== "income" && (
            <FilterSelect label="Fixa ou variável" value={filters.expenseType} onChange={(v) => set("expenseType", v as TxFilters["expenseType"])}
              options={[["all", "Fixas e variáveis"], ["fixed", "Fixas"], ["variable", "Variáveis"]]} />
          )}
          <FilterSelect label="Conta ou cartão" value={filters.accountId} onChange={(v) => set("accountId", v)}
            options={[["all", "Todas as contas"], ...data.accounts.map((a) => [a.id, a.name] as [string, string]), ...data.cards.map((c) => [c.id, `Cartão ${c.name}`] as [string, string])]} />
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" className="justify-self-start lg:col-span-5"
              onClick={() => onChange({ ...defaultFilters(), search: filters.search, preset: filters.preset, from: filters.from, to: filters.to, kind: showKind ? "all" : filters.kind })}>
              <X /> Limpar filtros
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="bg-background/40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const PAGE = 40;

export function TransactionsTable({ transactions, emptyTitle, emptyAction }: { transactions: Transaction[]; emptyTitle?: string; emptyAction?: React.ReactNode }) {
  const { data } = useFinance();
  const [limit, setLimit] = useState(PAGE);
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const accById = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);
  const cardById = useMemo(() => new Map(data.cards.map((c) => [c.id, c])), [data.cards]);

  const totals = useMemo(() => {
    const inc = sumMoney(transactions.filter((t) => t.kind === "income").map((t) => t.amount));
    const exp = sumMoney(transactions.filter((t) => t.kind === "expense").map((t) => t.amount));
    return { inc, exp };
  }, [transactions]);

  if (transactions.length === 0) {
    return (
      <Card>
        <EmptyState icon={Search} title={emptyTitle ?? "Nenhum lançamento encontrado"} description="Ajuste os filtros ou cadastre um novo lançamento." action={emptyAction} />
      </Card>
    );
  }

  const visible = transactions.slice(0, limit);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-xs text-muted-foreground">
        <span>
          {transactions.length} {transactions.length === 1 ? "lançamento" : "lançamentos"}
        </span>
        <span className="flex gap-4">
          {totals.inc > 0 && (
            <span>
              Receitas <Money value={totals.inc} tone="income" className="font-medium" />
            </span>
          )}
          {totals.exp > 0 && (
            <span>
              Despesas <Money value={totals.exp} tone="expense" className="font-medium" />
            </span>
          )}
        </span>
      </div>

      {/* Tabela (telas médias e grandes) */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Data</th>
              <th className="px-4 py-2.5 font-medium">Descrição</th>
              <th className="px-4 py-2.5 font-medium">Categoria</th>
              <th className="px-4 py-2.5 font-medium">Conta / forma</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Valor</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => {
              const cat = t.category_id ? catById.get(t.category_id) : undefined;
              const where = t.card_id ? cardById.get(t.card_id)?.name : t.account_id ? accById.get(t.account_id)?.name : undefined;
              return (
                <tr key={t.id} className="group border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular">{formatDate(t.date)}</td>
                  <td className="max-w-72 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{t.description}</span>
                      <TxBadges t={t} />
                    </div>
                    {(t.notes || t.source) && <p className="truncate text-xs text-muted-foreground">{[t.source, t.notes].filter(Boolean).join(" · ")}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {cat ? (
                      <span className="flex items-center gap-2">
                        <CategoryIcon icon={cat.icon} color={cat.color} size="sm" />
                        <span className="truncate">{cat.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Sem categoria</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="truncate">{where ?? "—"}</div>
                    <div className="text-xs">{PAYMENT_METHOD_LABEL[t.payment_method]}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge t={t} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    <Money value={t.kind === "income" ? t.amount : -t.amount} tone={t.kind === "income" ? "income" : "expense"} sign />
                  </td>
                  <td className="px-2 py-3">
                    <RowMenu t={t} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Lista (celular) */}
      <ul className="divide-y divide-border/60 md:hidden">
        {visible.map((t) => {
          const cat = t.category_id ? catById.get(t.category_id) : undefined;
          return (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              <CategoryIcon icon={cat?.icon ?? "circle"} color={cat?.color ?? "#71717a"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{t.description}</p>
                  <TxBadges t={t} />
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDateShort(t.date)} · {cat?.name ?? "Sem categoria"}
                  {!t.card_id && t.status === "pending" && <span className="text-warning"> · pendente</span>}
                </p>
              </div>
              <Money value={t.kind === "income" ? t.amount : -t.amount} tone={t.kind === "income" ? "income" : "expense"} sign className="text-sm font-medium" />
              <RowMenu t={t} />
            </li>
          );
        })}
      </ul>

      {transactions.length > limit && (
        <div className="border-t border-border p-3 text-center">
          <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
            Mostrar mais ({transactions.length - limit} restantes)
          </Button>
        </div>
      )}
    </Card>
  );
}

function TxBadges({ t }: { t: Transaction }) {
  return (
    <>
      {t.installment_total && t.installment_total > 1 && (
        <Badge variant="outline" className="shrink-0">
          {t.installment_number}/{t.installment_total}
        </Badge>
      )}
      {t.card_id && !t.installment_total && <CreditCard className="size-3.5 shrink-0 text-muted-foreground" aria-label="Cartão de crédito" />}
      {t.recurring_bill_id && <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="Conta recorrente" />}
    </>
  );
}

function StatusBadge({ t }: { t: Transaction }) {
  if (t.card_id) return <Badge variant="info">Cartão</Badge>;
  if (t.status === "paid") return <Badge variant="success">{t.kind === "income" ? "Recebida" : "Paga"}</Badge>;
  return <Badge variant="warning">{t.kind === "income" ? "A receber" : "Pendente"}</Badge>;
}

function RowMenu({ t }: { t: Transaction }) {
  const { edit, remove, togglePaid } = useTransactionActions();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${t.description}`} className={cn("text-muted-foreground")}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => edit(t)}>
          <Pencil /> Editar
        </DropdownMenuItem>
        {!t.card_id && (
          <DropdownMenuItem onSelect={() => void togglePaid(t)}>
            {t.status === "paid" ? <CircleDashed /> : <Check />}
            {t.status === "paid" ? "Marcar como pendente" : t.kind === "income" ? "Marcar como recebida" : "Marcar como paga"}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => void remove(t)}>
          <Trash2 /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
