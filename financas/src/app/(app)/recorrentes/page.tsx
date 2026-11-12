"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CalendarClock, Check, FastForward, Loader2, MoreHorizontal, Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { MoneyInput } from "@/components/money-input";
import { CategoryIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { useConfirm } from "@/components/confirm";
import { useFinance } from "@/lib/store/finance-store";
import { billState, monthlyEquivalent, nextDueDate, type BillState } from "@/lib/finance";
import { BILL_METHODS, FREQUENCY_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { formatDate, isValidISODate, relativeDay, sumMoney, todayISO } from "@/lib/format";
import { validateBill, type Errors } from "@/lib/validation";
import type { Frequency, PaymentMethod, RecurringBill } from "@/lib/types";
import { cn } from "@/lib/utils";

const SECTIONS: { state: BillState; title: string }[] = [
  { state: "overdue", title: "Atrasadas" },
  { state: "due_soon", title: "Vencem nos próximos 7 dias" },
  { state: "upcoming", title: "Próximas" },
  { state: "inactive", title: "Pausadas" },
];

export default function RecurringPage() {
  const { data } = useFinance();
  const today = todayISO();
  const [editing, setEditing] = useState<RecurringBill | null | "new">(null);
  const [paying, setPaying] = useState<RecurringBill | null>(null);

  const grouped = useMemo(() => {
    const g: Record<BillState, RecurringBill[]> = { overdue: [], due_soon: [], upcoming: [], inactive: [] };
    for (const b of data.bills) g[billState(b, today)].push(b);
    for (const k of Object.keys(g) as BillState[]) g[k].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
    return g;
  }, [data.bills, today]);

  const monthly = sumMoney(data.bills.filter((b) => b.active).map(monthlyEquivalent));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Contas fixas e recorrentes"
        description="Internet, energia, aluguel, assinaturas e outras contas que se repetem."
        actions={<Button onClick={() => setEditing("new")}><Plus /> Nova conta recorrente</Button>}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Custo mensal estimado" icon={Repeat} value={<Money value={monthly} />} footer="Contas ativas convertidas para mês" />
        <StatCard label="Atrasadas" icon={AlertCircle} tone={grouped.overdue.length ? "expense" : "neutral"} value={<span className="tabular">{grouped.overdue.length}</span>} footer={grouped.overdue.length ? <Money value={sumMoney(grouped.overdue.map((b) => b.amount))} /> : "Nenhuma conta atrasada"} />
        <StatCard label="Vencem em 7 dias" icon={CalendarClock} tone={grouped.due_soon.length ? "warning" : "neutral"} value={<span className="tabular">{grouped.due_soon.length}</span>} footer={grouped.due_soon.length ? <Money value={sumMoney(grouped.due_soon.map((b) => b.amount))} /> : "Nada vencendo esta semana"} />
      </section>

      {data.bills.length === 0 ? (
        <Card>
          <EmptyState icon={Repeat} title="Nenhuma conta recorrente" description="Cadastre contas que se repetem para ver o que vence e o que está atrasado." action={<Button onClick={() => setEditing("new")}><Plus /> Cadastrar conta</Button>} />
        </Card>
      ) : (
        SECTIONS.filter((s) => grouped[s.state].length).map((s) => (
          <section key={s.state} className="grid gap-3">
            <h2 className={cn("text-sm font-semibold", s.state === "overdue" && "text-expense")}>{s.title} <span className="font-normal text-muted-foreground">({grouped[s.state].length})</span></h2>
            <Card className="divide-y divide-border/60 overflow-hidden">
              {grouped[s.state].map((b) => (
                <BillRow key={b.id} bill={b} state={s.state} onEdit={() => setEditing(b)} onPay={() => setPaying(b)} />
              ))}
            </Card>
          </section>
        ))
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">{editing !== null && <BillForm bill={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent>{paying && <PayBillForm bill={paying} onClose={() => setPaying(null)} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function BillRow({ bill, state, onEdit, onPay }: { bill: RecurringBill; state: BillState; onEdit: () => void; onPay: () => void }) {
  const { data, update, remove } = useFinance();
  const confirm = useConfirm();
  const today = todayISO();
  const cat = data.categories.find((c) => c.id === bill.category_id);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast.success(msg); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap">
      <CategoryIcon icon={cat?.icon ?? "repeat"} color={cat?.color ?? "#71717a"} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{bill.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {FREQUENCY_LABEL[bill.frequency]} · {PAYMENT_METHOD_LABEL[bill.payment_method]}{cat ? ` · ${cat.name}` : ""}
        </p>
      </div>
      <div className="text-right">
        <p className="font-medium"><Money value={bill.amount} /></p>
        <p className={cn("text-xs", state === "overdue" ? "text-expense" : state === "due_soon" ? "text-warning" : "text-muted-foreground")}>
          {formatDate(bill.next_due_date)} · {relativeDay(bill.next_due_date, today)}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {bill.active && (
          <Button size="sm" variant={state === "overdue" ? "default" : "outline"} onClick={onPay}>
            <Check /> Pagar
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${bill.name}`}><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}><Pencil /> Editar</DropdownMenuItem>
            {bill.active && (
              <DropdownMenuItem onSelect={() => void act(() => update("recurring_bills", bill.id, { next_due_date: nextDueDate(bill.next_due_date, bill.frequency, bill.anchor_day) }), "Vencimento pulado para o próximo período.")}>
                <FastForward /> Pular este vencimento
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => void act(() => update("recurring_bills", bill.id, { active: !bill.active }), bill.active ? "Conta pausada." : "Conta reativada.")}>
              {bill.active ? <Pause /> : <Play />} {bill.active ? "Pausar" : "Reativar"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={async () => {
              if (!(await confirm({ title: `Excluir ${bill.name}?`, description: "Os pagamentos já lançados continuam nas despesas." }))) return;
              await act(() => remove("recurring_bills", bill.id), "Conta recorrente excluída.");
            }}>
              <Trash2 /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function PayBillForm({ bill, onClose }: { bill: RecurringBill; onClose: () => void }) {
  const { data, insert, update } = useFinance();
  const accounts = data.accounts.filter((a) => !a.archived);
  const [amount, setAmount] = useState<number | null>(bill.amount);
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState<string | null>(bill.account_id ?? (accounts.length === 1 ? accounts[0].id : null));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const next = nextDueDate(bill.next_due_date, bill.frequency, bill.anchor_day);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    if (!amount || amount <= 0) errs.amount = "Informe um valor maior que zero.";
    if (!accountId) errs.account = "Escolha a conta usada no pagamento.";
    if (!isValidISODate(date)) errs.date = "Data inválida.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await insert("transactions", {
        kind: "expense",
        description: bill.name,
        amount: amount!,
        date,
        category_id: bill.category_id,
        account_id: accountId,
        card_id: null,
        payment_method: bill.payment_method === "credit" ? "debit" : bill.payment_method,
        status: "paid",
        expense_type: "fixed",
        notes: `Vencimento ${formatDate(bill.next_due_date)}`,
        recurring_bill_id: bill.id,
      });
      await update("recurring_bills", bill.id, { next_due_date: next });
      toast.success(`${bill.name} paga. Próximo vencimento em ${formatDate(next)}.`);
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
        <DialogTitle>Pagar {bill.name}</DialogTitle>
        <DialogDescription>Será lançada uma despesa paga e o próximo vencimento passa para {formatDate(next)}.</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor pago" htmlFor="pb-amount" error={errors.amount}>
            <MoneyInput id="pb-amount" value={amount} onChange={setAmount} invalid={!!errors.amount} />
          </Field>
          <Field label="Data do pagamento" htmlFor="pb-date" error={errors.date}>
            <Input id="pb-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Conta" error={errors.account}>
          <Select value={accountId ?? undefined} onValueChange={setAccountId}>
            <SelectTrigger aria-label="Conta" aria-invalid={!!errors.account || undefined}><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Confirmar pagamento</Button>
      </DialogFooter>
    </form>
  );
}

function BillForm({ bill, onClose }: { bill: RecurringBill | null; onClose: () => void }) {
  const { data, insert, update } = useFinance();
  const [name, setName] = useState(bill?.name ?? "");
  const [amount, setAmount] = useState<number | null>(bill?.amount ?? null);
  const [categoryId, setCategoryId] = useState<string>(bill?.category_id ?? "none");
  const [frequency, setFrequency] = useState<Frequency>(bill?.frequency ?? "monthly");
  const [nextDate, setNextDate] = useState(bill?.next_due_date ?? "");
  const [accountId, setAccountId] = useState<string>(bill?.account_id ?? "none");
  const [method, setMethod] = useState<PaymentMethod>(bill?.payment_method ?? "boleto");
  const [notes, setNotes] = useState(bill?.notes ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateBill({ name, amount, next_due_date: nextDate, frequency });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const row = {
      name: name.trim(),
      amount: amount!,
      category_id: categoryId === "none" ? null : categoryId,
      frequency,
      next_due_date: nextDate,
      // Dia de referência para meses curtos (ex.: dia 31 → 28/29 em fevereiro, volta a 31 em março).
      anchor_day: bill && bill.next_due_date === nextDate ? bill.anchor_day : Number(nextDate.slice(8, 10)),
      account_id: accountId === "none" ? null : accountId,
      payment_method: method,
      notes: notes.trim() || null,
    };
    setSaving(true);
    try {
      if (bill) await update("recurring_bills", bill.id, row);
      else await insert("recurring_bills", row);
      toast.success(bill ? "Conta atualizada." : "Conta recorrente cadastrada.");
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
        <DialogTitle>{bill ? "Editar conta recorrente" : "Nova conta recorrente"}</DialogTitle>
        <DialogDescription>Ex.: internet, energia, água, aluguel, academia, streaming.</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="Nome" htmlFor="bill-name" error={errors.name}>
            <Input id="bill-name" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Internet" aria-invalid={!!errors.name || undefined} />
          </Field>
          <Field label="Valor" htmlFor="bill-amount" error={errors.amount}>
            <MoneyInput id="bill-amount" value={amount} onChange={setAmount} invalid={!!errors.amount} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Frequência">
            <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
              <SelectTrigger aria-label="Frequência"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => <SelectItem key={f} value={f}>{FREQUENCY_LABEL[f]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Próximo vencimento" htmlFor="bill-date" error={errors.next_due_date}>
            <Input id="bill-date" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} aria-invalid={!!errors.next_due_date || undefined} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoria" optional>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger aria-label="Categoria"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem categoria</SelectItem>
                {data.categories.filter((c) => c.kind === "expense").map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Forma de pagamento">
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger aria-label="Forma de pagamento"><SelectValue /></SelectTrigger>
              <SelectContent>{BILL_METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Conta padrão para pagamento" optional>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger aria-label="Conta padrão"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Escolher ao pagar</SelectItem>
              {data.accounts.filter((a) => !a.archived).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Observações" htmlFor="bill-notes" optional>
          <Textarea id="bill-notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {bill && !bill.active && <Badge variant="warning" className="justify-self-start">Esta conta está pausada</Badge>}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Salvar</Button>
      </DialogFooter>
    </form>
  );
}
