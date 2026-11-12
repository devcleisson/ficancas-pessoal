"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, OctagonAlert, Pencil, PieChart, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { MonthSwitcher } from "@/components/month-switcher";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { MoneyInput } from "@/components/money-input";
import { CategoryIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { useConfirm } from "@/components/confirm";
import { useFinance } from "@/lib/store/finance-store";
import { budgetStatuses, categoryBreakdown, type BudgetLevel } from "@/lib/finance";
import { formatPercent, monthEnd, monthKey, sumMoney, todayISO } from "@/lib/format";
import { validateBudget, type Errors } from "@/lib/validation";
import type { Budget } from "@/lib/types";
import { cn } from "@/lib/utils";

const LEVEL: Record<BudgetLevel, { bar: string; badge?: { label: string; variant: "warning" | "danger" } }> = {
  ok: { bar: "bg-primary" },
  warning: { bar: "bg-warning", badge: { label: "Atingiu 70%", variant: "warning" } },
  danger: { bar: "bg-orange-500", badge: { label: "Atingiu 90%", variant: "danger" } },
  over: { bar: "bg-expense", badge: { label: "Ultrapassado", variant: "danger" } },
};

export default function BudgetPage() {
  const { data, remove } = useFinance();
  const confirm = useConfirm();
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [editing, setEditing] = useState<Budget | null | "new">(null);

  const statuses = useMemo(() => budgetStatuses(data.budgets, data.categories, data.transactions, month), [data, month]);
  const totals = useMemo(() => {
    const limit = sumMoney(statuses.map((s) => s.budget.amount));
    const spent = sumMoney(statuses.map((s) => s.spent));
    return { limit, spent, remaining: limit - spent, ratio: limit > 0 ? spent / limit : 0 };
  }, [statuses]);

  const unbudgeted = useMemo(() => {
    const has = new Set(data.budgets.map((b) => b.category_id));
    return categoryBreakdown(data.transactions, data.categories, "expense", `${month}-01`, monthEnd(month)).filter((c) => c.categoryId && !has.has(c.categoryId));
  }, [data, month]);

  const alerts = statuses.filter((s) => s.level !== "ok");

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Orçamento"
        description="Limites mensais de gastos por categoria."
        actions={
          <>
            <MonthSwitcher value={month} onChange={setMonth} />
            <Button onClick={() => setEditing("new")}><Plus /> Definir limite</Button>
          </>
        }
      />

      {statuses.length > 0 && (
        <Card className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-2xl font-semibold tracking-tight"><Money value={totals.spent} /></span>
              <span className="text-sm text-muted-foreground">de <Money value={totals.limit} /> planejados</span>
            </div>
            <Progress value={totals.ratio} className="mt-3 h-2.5" indicatorClassName={LEVEL[totals.ratio > 1 ? "over" : totals.ratio >= 0.9 ? "danger" : totals.ratio >= 0.7 ? "warning" : "ok"].bar} />
            <p className="mt-2 text-xs text-muted-foreground">{formatPercent(totals.ratio)} do orçamento total utilizado</p>
          </div>
          <div className="rounded-xl bg-muted/60 px-5 py-3 text-right">
            <p className="text-xs text-muted-foreground">{totals.remaining >= 0 ? "Disponível" : "Acima do planejado"}</p>
            <p className={cn("text-xl font-semibold", totals.remaining < 0 ? "text-expense" : "text-income")}><Money value={Math.abs(totals.remaining)} /></p>
          </div>
        </Card>
      )}

      {alerts.length > 0 && (
        <div className="grid gap-2" role="status">
          {alerts.map((s) => (
            <div key={s.budget.id} className={cn("flex items-center gap-3 rounded-xl border px-4 py-3 text-sm", s.level === "warning" ? "border-warning/30 bg-warning/8" : "border-expense/30 bg-expense/8")}>
              {s.level === "warning" ? <AlertTriangle className="size-4 shrink-0 text-warning" /> : <OctagonAlert className="size-4 shrink-0 text-expense" />}
              <span>
                <b>{s.category?.name}</b>{" "}
                {s.level === "over" ? <>ultrapassou o limite em <Money value={-s.remaining} className="font-medium" />.</> : <>já usou {formatPercent(s.ratio)} do orçamento.</>}
              </span>
            </div>
          ))}
        </div>
      )}

      {statuses.length === 0 ? (
        <Card>
          <EmptyState icon={PieChart} title="Nenhum limite definido" description="Defina quanto pretende gastar por mês em cada categoria e receba alertas em 70%, 90% e ao ultrapassar." action={<Button onClick={() => setEditing("new")}><Plus /> Definir primeiro limite</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {statuses.map((s) => {
            const lv = LEVEL[s.level];
            return (
              <Card key={s.budget.id} className="p-5">
                <div className="flex items-start gap-3">
                  <CategoryIcon icon={s.category?.icon ?? "circle"} color={s.category?.color ?? "#71717a"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.category?.name ?? "Categoria"}</p>
                    <p className="text-xs text-muted-foreground">Limite <Money value={s.budget.amount} /></p>
                  </div>
                  {lv.badge && <Badge variant={lv.badge.variant}>{lv.badge.label}</Badge>}
                </div>
                <Progress value={s.ratio} className="mt-4 h-2" indicatorClassName={lv.bar} />
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span><Money value={s.spent} className="font-medium" /> <span className="text-xs text-muted-foreground">gastos</span></span>
                  <span className="text-xs text-muted-foreground tabular">{formatPercent(s.ratio)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <p className={cn("text-xs", s.remaining < 0 ? "text-expense" : "text-muted-foreground")}>
                    {s.remaining >= 0 ? <>Ainda pode gastar <Money value={s.remaining} className="font-medium text-foreground" /></> : <>Excedeu <Money value={-s.remaining} className="font-medium" /></>}
                  </p>
                  <div className="flex">
                    <Button variant="ghost" size="icon-sm" aria-label={`Editar limite de ${s.category?.name}`} onClick={() => setEditing(s.budget)}><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Excluir limite de ${s.category?.name}`} onClick={async () => {
                      if (!(await confirm({ title: `Remover limite de ${s.category?.name}?` }))) return;
                      try { await remove("budgets", s.budget.id); toast.success("Limite removido."); } catch (e) { toast.error((e as Error).message); }
                    }}><Trash2 /></Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {unbudgeted.length > 0 && (
        <Card className="p-5">
          <p className="text-sm font-medium">Gastos sem limite definido neste mês</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {unbudgeted.map((c) => (
              <li key={c.categoryId} className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs">
                <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
                {c.name} · <Money value={c.total} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>{editing !== null && <BudgetForm budget={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function BudgetForm({ budget, onClose }: { budget: Budget | null; onClose: () => void }) {
  const { data, insert, update } = useFinance();
  const used = new Set(data.budgets.map((b) => b.category_id));
  const options = data.categories.filter((c) => c.kind === "expense" && (!used.has(c.id) || c.id === budget?.category_id));
  const [categoryId, setCategoryId] = useState<string | null>(budget?.category_id ?? null);
  const [amount, setAmount] = useState<number | null>(budget?.amount ?? null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateBudget({ category_id: categoryId, amount });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      if (budget) await update("budgets", budget.id, { category_id: categoryId!, amount: amount! });
      else await insert("budgets", { category_id: categoryId!, amount: amount! });
      toast.success("Limite salvo.");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>{budget ? "Editar limite" : "Novo limite mensal"}</DialogTitle>
        <DialogDescription>O limite vale para todos os meses. Compras no cartão contam na data da compra.</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        <Field label="Categoria" error={errors.category_id}>
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todas as categorias de despesa já têm limite.</p>
          ) : (
            <Select value={categoryId ?? undefined} onValueChange={setCategoryId}>
              <SelectTrigger aria-label="Categoria" aria-invalid={!!errors.category_id || undefined}><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{options.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Limite por mês" htmlFor="bud-amount" error={errors.amount}>
          <MoneyInput id="bud-amount" value={amount} onChange={setAmount} invalid={!!errors.amount} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Salvar</Button>
      </DialogFooter>
    </form>
  );
}
