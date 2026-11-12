"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, CalendarDays, Check, History, Loader2, Minus, MoreHorizontal, Pencil, Plus, Target, Trash2, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { MoneyInput } from "@/components/money-input";
import { ColorPicker } from "@/components/color-picker";
import { CategoryIcon, ICONS } from "@/components/category-icon";
import { Money } from "@/components/money";
import { useConfirm } from "@/components/confirm";
import { useFinance } from "@/lib/store/finance-store";
import { goalProgress } from "@/lib/finance";
import { formatDate, formatPercent, isValidISODate, sumMoney, todayISO } from "@/lib/format";
import { validateGoal, type Errors } from "@/lib/validation";
import type { Goal } from "@/lib/types";
import { cn } from "@/lib/utils";

const GOAL_ICONS = ["target", "smartphone", "laptop", "plane", "home", "car", "piggy-bank", "graduation-cap", "gift", "heart-pulse", "shirt", "sparkles"];

export default function GoalsPage() {
  const { data } = useFinance();
  const today = todayISO();
  const [editing, setEditing] = useState<Goal | null | "new">(null);
  const [contributing, setContributing] = useState<{ goal: Goal; withdraw: boolean } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const goals = data.goals.filter((g) => showArchived || !g.archived);
  const active = data.goals.filter((g) => !g.archived);
  const progress = useMemo(() => new Map(data.goals.map((g) => [g.id, goalProgress(g, data.contributions, today)])), [data.goals, data.contributions, today]);
  const totalSaved = sumMoney(active.map((g) => Math.max(0, progress.get(g.id)!.saved)));
  const totalTarget = sumMoney(active.map((g) => g.target_amount));
  const done = active.filter((g) => progress.get(g.id)!.done).length;

  return (
    <div className="grid gap-6">
      <PageHeader title="Metas financeiras" description="Acompanhe seus objetivos e quanto falta para cada um." actions={<Button onClick={() => setEditing("new")}><Plus /> Nova meta</Button>} />

      {active.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Guardado em metas" icon={Target} tone="primary" value={<Money value={totalSaved} />} footer={<>de <Money value={totalTarget} /> no total</>} />
          <StatCard label="Progresso geral" icon={Check} value={<span className="tabular">{formatPercent(totalTarget > 0 ? totalSaved / totalTarget : 0)}</span>} footer={<Progress value={totalTarget > 0 ? totalSaved / totalTarget : 0} className="mt-1" />} />
          <StatCard label="Metas concluídas" icon={Trophy} tone="income" value={<span className="tabular">{done} de {active.length}</span>} />
        </section>
      )}

      {goals.length === 0 ? (
        <Card>
          <EmptyState icon={Target} title="Nenhuma meta criada" description="Ex.: reserva de emergência, comprar um computador, guardar para viajar." action={<Button onClick={() => setEditing("new")}><Plus /> Criar meta</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} onEdit={() => setEditing(g)} onContribute={(withdraw) => setContributing({ goal: g, withdraw })} />
          ))}
        </div>
      )}

      {data.goals.some((g) => g.archived) && (
        <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setShowArchived((s) => !s)}>
          {showArchived ? "Ocultar metas arquivadas" : "Mostrar metas arquivadas"}
        </Button>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>{editing !== null && <GoalForm goal={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={!!contributing} onOpenChange={(o) => !o && setContributing(null)}>
        <DialogContent>{contributing && <ContributionForm goal={contributing.goal} withdraw={contributing.withdraw} onClose={() => setContributing(null)} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function GoalCard({ goal, onEdit, onContribute }: { goal: Goal; onEdit: () => void; onContribute: (withdraw: boolean) => void }) {
  const { data, update, remove } = useFinance();
  const confirm = useConfirm();
  const [showHistory, setShowHistory] = useState(false);
  const p = goalProgress(goal, data.contributions, todayISO());
  const history = data.contributions.filter((c) => c.goal_id === goal.id).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card className={cn("flex flex-col p-5", goal.archived && "opacity-60")}>
      <div className="flex items-start gap-3">
        <CategoryIcon icon={goal.icon} color={goal.color} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{goal.name}</p>
          <p className="text-xs text-muted-foreground">Objetivo <Money value={goal.target_amount} /></p>
        </div>
        {p.done ? <Badge variant="success"><Trophy /> Concluída</Badge> : p.late ? <Badge variant="danger">Prazo vencido</Badge> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Ações da meta ${goal.name}`}><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}><Pencil /> Editar</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onContribute(true)}><Minus /> Retirar valor</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void update("goals", goal.id, { archived: !goal.archived }).then(() => toast.success(goal.archived ? "Meta reativada." : "Meta arquivada.")).catch((e: Error) => toast.error(e.message))}>
              {goal.archived ? <ArchiveRestore /> : <Archive />} {goal.archived ? "Reativar" : "Arquivar"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={async () => {
              if (!(await confirm({ title: `Excluir a meta ${goal.name}?`, description: "O histórico de valores adicionados também será excluído." }))) return;
              try { await remove("goals", goal.id); toast.success("Meta excluída."); } catch (e) { toast.error((e as Error).message); }
            }}>
              <Trash2 /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-5 flex items-baseline justify-between">
        <span className="text-2xl font-semibold tracking-tight"><Money value={p.saved} /></span>
        <span className="text-sm font-medium tabular" style={{ color: goal.color }}>{formatPercent(Math.min(p.ratio, 9.99))}</span>
      </div>
      <Progress value={p.ratio} className="mt-2 h-2.5" color={goal.color} />
      <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
        {!p.done && <p>Faltam <Money value={p.remaining} className="font-medium text-foreground" /></p>}
        {goal.deadline && (
          <p className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" /> Prazo {formatDate(goal.deadline)}
            {p.monthlyNeeded != null && !p.late && <> · guarde <Money value={p.monthlyNeeded} className="font-medium text-foreground" />/mês</>}
          </p>
        )}
      </div>

      <div className="mt-auto flex gap-2 pt-5">
        <Button className="flex-1" variant={p.done ? "outline" : "default"} onClick={() => onContribute(false)} disabled={goal.archived}>
          <Plus /> Adicionar valor
        </Button>
        <Button variant="outline" size="icon" onClick={() => setShowHistory((s) => !s)} aria-label="Histórico de valores" aria-expanded={showHistory}>
          <History />
        </Button>
      </div>

      {showHistory && (
        <ul className="mt-3 grid animate-rise gap-1 border-t border-border pt-3">
          {history.length === 0 && <li className="text-xs text-muted-foreground">Nenhum valor adicionado ainda.</li>}
          {history.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <span className="text-xs text-muted-foreground tabular">{formatDate(c.date)}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{c.note}</span>
              <Money value={c.amount} tone={c.amount < 0 ? "expense" : "income"} sign className="text-xs font-medium" />
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:text-expense"
                aria-label="Excluir este valor"
                onClick={async () => {
                  if (!(await confirm({ title: "Excluir este registro?" }))) return;
                  try { await remove("goal_contributions", c.id); toast.success("Registro excluído."); } catch (e) { toast.error((e as Error).message); }
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ContributionForm({ goal, withdraw, onClose }: { goal: Goal; withdraw: boolean; onClose: () => void }) {
  const { data, insert } = useFinance();
  const saved = goalProgress(goal, data.contributions, todayISO()).saved;
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    if (!amount || amount <= 0) errs.amount = "Informe um valor maior que zero.";
    else if (withdraw && amount > saved + 0.001) errs.amount = "Não é possível retirar mais do que foi guardado.";
    if (!isValidISODate(date)) errs.date = "Data inválida.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await insert("goal_contributions", { goal_id: goal.id, amount: withdraw ? -amount! : amount!, date, note: note.trim() || null });
      toast.success(withdraw ? "Retirada registrada." : "Valor adicionado à meta.");
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
        <DialogTitle>{withdraw ? "Retirar da meta" : "Adicionar valor"}</DialogTitle>
        <DialogDescription>{goal.name} · guardado até agora: R$ {saved.toFixed(2).replace(".", ",")}</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor" htmlFor="gc-amount" error={errors.amount}>
            <MoneyInput id="gc-amount" autoFocus value={amount} onChange={setAmount} invalid={!!errors.amount} />
          </Field>
          <Field label="Data" htmlFor="gc-date" error={errors.date}>
            <Input id="gc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Observação" htmlFor="gc-note" optional>
          <Input id="gc-note" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant={withdraw ? "destructive" : "default"} disabled={saving}>{saving && <Loader2 className="animate-spin" />} {withdraw ? "Retirar" : "Adicionar"}</Button>
      </DialogFooter>
    </form>
  );
}

function GoalForm({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { insert, update } = useFinance();
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState<number | null>(goal?.target_amount ?? null);
  const [initial, setInitial] = useState<number | null>(null);
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [color, setColor] = useState(goal?.color ?? "#10b981");
  const [icon, setIcon] = useState(goal?.icon ?? "target");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateGoal({ name, target_amount: target, deadline: deadline || null, initial: goal ? null : initial });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const row = { name: name.trim(), target_amount: target!, deadline: deadline || null, color, icon };
    setSaving(true);
    try {
      if (goal) {
        await update("goals", goal.id, row);
      } else {
        const created = await insert("goals", row);
        if (initial && initial > 0) await insert("goal_contributions", { goal_id: created.id, amount: initial, date: todayISO(), note: "Valor já acumulado" });
      }
      toast.success(goal ? "Meta atualizada." : "Meta criada.");
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
        <DialogTitle>{goal ? "Editar meta" : "Nova meta"}</DialogTitle>
        <DialogDescription>Defina o valor desejado e, se quiser, um prazo.</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        <Field label="Nome" htmlFor="goal-name" error={errors.name}>
          <Input id="goal-name" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Reserva de emergência" aria-invalid={!!errors.name || undefined} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor desejado" htmlFor="goal-target" error={errors.target_amount}>
            <MoneyInput id="goal-target" value={target} onChange={setTarget} invalid={!!errors.target_amount} />
          </Field>
          {!goal && (
            <Field label="Valor já acumulado" htmlFor="goal-initial" optional error={errors.initial}>
              <MoneyInput id="goal-initial" value={initial} onChange={setInitial} invalid={!!errors.initial} />
            </Field>
          )}
          <Field label="Prazo" htmlFor="goal-deadline" optional error={errors.deadline}>
            <Input id="goal-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
        <Field label="Ícone">
          <div className="flex flex-wrap gap-2">
            {GOAL_ICONS.filter((i) => ICONS[i]).map((i) => (
              <button key={i} type="button" onClick={() => setIcon(i)} aria-label={`Ícone ${i}`} aria-pressed={icon === i} className={cn("rounded-lg ring-offset-2 ring-offset-card", icon === i && "ring-2 ring-foreground/50")}>
                <CategoryIcon icon={i} color={color} />
              </button>
            ))}
          </div>
        </Field>
        <Field label="Cor">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Salvar</Button>
      </DialogFooter>
    </form>
  );
}
