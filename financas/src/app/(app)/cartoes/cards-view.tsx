"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, CreditCard as CardIcon, Loader2, MoreHorizontal, Pencil, Plus, Receipt, Trash2, Undo2, Wallet,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { MoneyInput } from "@/components/money-input";
import { ColorPicker } from "@/components/color-picker";
import { CategoryIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { useConfirm } from "@/components/confirm";
import { useFinance } from "@/lib/store/finance-store";
import { useTransactionActions } from "@/components/transactions/quick-add";
import { buildInvoices, cardLimit, currentInvoiceMonth, type Invoice, type InvoiceStatus } from "@/lib/finance";
import { capitalize, formatDate, formatDateShort, formatMonth, todayISO } from "@/lib/format";
import { validateCard, type Errors } from "@/lib/validation";
import type { CreditCard } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<InvoiceStatus, { label: string; variant: "default" | "success" | "danger" | "warning" | "info" | "outline" }> = {
  open: { label: "Aberta", variant: "info" },
  closed: { label: "Fechada", variant: "warning" },
  paid: { label: "Paga", variant: "success" },
  partial: { label: "Paga parcialmente", variant: "warning" },
  overdue: { label: "Vencida", variant: "danger" },
  empty: { label: "Sem lançamentos", variant: "outline" },
};

export function CardsView() {
  const params = useSearchParams();
  const { data } = useFinance();
  const cards = data.cards;
  const [selectedId, setSelectedId] = useState<string | null>(params.get("card"));
  const [editing, setEditing] = useState<CreditCard | null | "new">(null);
  const selected = cards.find((c) => c.id === selectedId) ?? cards[0];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Cartões de crédito"
        description="Limites, faturas e compras parceladas."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> Novo cartão
          </Button>
        }
      />

      {cards.length === 0 ? (
        <Card>
          <EmptyState
            icon={CardIcon}
            title="Nenhum cartão cadastrado"
            description="Cadastre seus cartões para acompanhar limite, faturas e parcelamentos."
            action={<Button onClick={() => setEditing("new")}><Plus /> Cadastrar cartão</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-3">
            {cards.map((c) => (
              <CardTile key={c.id} card={c} active={selected?.id === c.id} onSelect={() => setSelectedId(c.id)} onEdit={() => setEditing(c)} />
            ))}
          </div>
          {selected && <CardDetails key={selected.id} card={selected} />}
        </>
      )}

      <CardDialog editing={editing} onClose={() => setEditing(null)} onSaved={(id) => setSelectedId(id)} />
    </div>
  );
}

function CardTile({ card, active, onSelect, onEdit }: { card: CreditCard; active: boolean; onSelect: () => void; onEdit: () => void }) {
  const { data, remove } = useFinance();
  const confirm = useConfirm();
  const limit = cardLimit(card, data.transactions, data.cardPayments);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}
      aria-pressed={active}
      className={cn(
        "relative min-w-[280px] snap-start overflow-hidden rounded-2xl border p-5 text-left text-white shadow-lg transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-white/30 ring-2 ring-primary/70" : "border-white/10 opacity-90 hover:opacity-100",
      )}
      style={{ background: `linear-gradient(135deg, ${card.color} 0%, color-mix(in srgb, ${card.color} 55%, #000) 100%)` }}
    >
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs text-white/70">{card.institution || "Cartão de crédito"}</p>
          <p className="text-lg font-semibold tracking-tight">{card.name}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <button className="rounded-md p-1 text-white/80 hover:bg-white/15" aria-label={`Ações do cartão ${card.name}`}>
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={onEdit}><Pencil /> Editar cartão</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={async () => {
                const ok = await confirm({
                  title: `Excluir o cartão ${card.name}?`,
                  description: "Todas as compras e pagamentos de fatura deste cartão também serão excluídos. Esta ação não pode ser desfeita.",
                  confirmText: "Excluir cartão",
                });
                if (!ok) return;
                try {
                  await remove("credit_cards", card.id);
                  toast.success("Cartão excluído.");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <Trash2 /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="relative mt-6">
        <p className="text-xs text-white/70">Limite disponível</p>
        <p className="text-2xl font-semibold tracking-tight"><Money value={limit.available} /></p>
        <Progress value={limit.ratio} className="mt-3 h-1.5 bg-white/20" indicatorClassName={cn(limit.ratio > 0.9 ? "bg-red-300" : "bg-white")} />
        <div className="mt-2 flex justify-between text-[11px] text-white/75">
          <span>Usado <Money value={limit.used} /></span>
          <span>Limite <Money value={card.limit_amount} /></span>
        </div>
        <p className="mt-3 text-[11px] text-white/70">Fecha dia {card.closing_day} · vence dia {card.due_day}</p>
      </div>
    </div>
  );
}

function CardDetails({ card }: { card: CreditCard }) {
  const { data, remove } = useFinance();
  const { open, edit } = useTransactionActions();
  const confirm = useConfirm();
  const today = todayISO();
  const invoices = useMemo(() => buildInvoices(card, data.transactions, data.cardPayments, today), [card, data.transactions, data.cardPayments, today]);
  const [month, setMonth] = useState(() => currentInvoiceMonth(card, today));
  const [paying, setPaying] = useState<Invoice | null>(null);
  const idx = invoices.findIndex((i) => i.month === month);
  const inv = invoices[idx] ?? invoices[0];
  const catById = new Map(data.categories.map((c) => [c.id, c]));
  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "—";

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader className="flex-wrap">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" disabled={idx >= invoices.length - 1} onClick={() => setMonth(invoices[idx + 1].month)} aria-label="Fatura anterior">
              <ChevronLeft />
            </Button>
            <div className="min-w-44 text-center">
              <CardTitle>Fatura de {capitalize(formatMonth(inv.month))}</CardTitle>
              <CardDescription>Vence em {formatDate(inv.dueDate)}</CardDescription>
            </div>
            <Button variant="ghost" size="icon-sm" disabled={idx <= 0} onClick={() => setMonth(invoices[idx - 1].month)} aria-label="Próxima fatura">
              <ChevronRight />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS[inv.status].variant}>{STATUS[inv.status].label}</Badge>
            <Button size="sm" variant="outline" onClick={() => open({ kind: "expense", defaults: { payment_method: "credit", card_id: card.id } })}>
              <Plus /> Compra
            </Button>
            <Button size="sm" disabled={inv.remaining <= 0} onClick={() => setPaying(inv)}>
              <Wallet /> Pagar fatura
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/50 p-4">
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-semibold"><Money value={inv.total} /></p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pago</p>
              <p className="font-semibold text-income"><Money value={inv.paid} /></p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Restante</p>
              <p className="font-semibold"><Money value={inv.remaining} /></p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Compras de {formatDate(inv.periodStart)} a {formatDate(inv.periodEnd)} · fechamento em {formatDate(inv.closingDate)}
          </p>

          {inv.purchases.length === 0 ? (
            <EmptyState icon={Receipt} title="Nenhuma compra nesta fatura" className="py-8" />
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {inv.purchases.map((t) => {
                const cat = t.category_id ? catById.get(t.category_id) : undefined;
                return (
                  <li key={t.id}>
                    <button type="button" onClick={() => edit(t)} className="flex w-full items-center gap-3 py-2.5 text-left hover:opacity-80">
                      <CategoryIcon icon={cat?.icon ?? "circle"} color={cat?.color ?? "#71717a"} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {t.description}
                          {t.installment_total && t.installment_total > 1 && <span className="ml-1.5 text-xs text-muted-foreground">{t.installment_number}/{t.installment_total}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDateShort(t.date)} · {cat?.name ?? "Sem categoria"}</p>
                      </div>
                      <Money value={t.amount} className="text-sm font-medium" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {inv.payments.length > 0 && (
            <div className="mt-4 rounded-xl border border-border p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Pagamentos desta fatura</p>
              <ul className="grid gap-1.5">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{formatDate(p.date)} · {accountName(p.account_id)}</span>
                    <span className="flex items-center gap-2">
                      <Money value={p.amount} tone="income" />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Desfazer pagamento"
                        onClick={async () => {
                          if (!(await confirm({ title: "Desfazer este pagamento?", description: "O valor volta para o saldo da conta e a fatura fica em aberto.", confirmText: "Desfazer" }))) return;
                          try {
                            await remove("card_payments", p.id);
                            toast.success("Pagamento desfeito.");
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        <Undo2 />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Histórico de faturas</CardTitle>
            <CardDescription>{invoices.length} fatura(s)</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-3">
          <ul className="grid gap-1">
            {invoices.map((i) => (
              <li key={i.month}>
                <button
                  type="button"
                  onClick={() => setMonth(i.month)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/60", i.month === inv.month && "bg-muted")}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{capitalize(formatMonth(i.month))}</p>
                    <p className="text-xs text-muted-foreground">Vence {formatDate(i.dueDate)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium"><Money value={i.total} /></p>
                    <Badge variant={STATUS[i.status].variant} className="mt-0.5">{STATUS[i.status].label}</Badge>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <PayInvoiceDialog card={card} invoice={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

function PayInvoiceDialog({ card, invoice, onClose }: { card: CreditCard; invoice: Invoice | null; onClose: () => void }) {
  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>{invoice && <PayInvoiceForm card={card} invoice={invoice} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function PayInvoiceForm({ card, invoice, onClose }: { card: CreditCard; invoice: Invoice; onClose: () => void }) {
  const { data, insert } = useFinance();
  const accounts = data.accounts.filter((a) => !a.archived);
  const [amount, setAmount] = useState<number | null>(invoice.remaining);
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState<string | null>(card.default_account_id ?? (accounts.length === 1 ? accounts[0].id : null));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    if (!amount || amount <= 0) errs.amount = "Informe um valor maior que zero.";
    else if (amount > invoice.remaining + 0.001) errs.amount = "O valor não pode ser maior que o restante da fatura.";
    if (!accountId) errs.account = "Escolha a conta que pagou a fatura.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errs.date = "Data inválida.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await insert("card_payments", { card_id: card.id, reference_month: `${invoice.month}-01`, amount: amount!, date, account_id: accountId! });
      toast.success("Pagamento da fatura registrado.");
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
        <DialogTitle>Pagar fatura</DialogTitle>
        <DialogDescription>{card.name} · {capitalize(formatMonth(invoice.month))}. O valor será debitado da conta escolhida.</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        <Field label="Valor pago" htmlFor="pay-amount" error={errors.amount} hint={`Restante: R$ ${invoice.remaining.toFixed(2).replace(".", ",")}`}>
          <MoneyInput id="pay-amount" value={amount} onChange={setAmount} invalid={!!errors.amount} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Conta" error={errors.account}>
            <Select value={accountId ?? undefined} onValueChange={setAccountId}>
              <SelectTrigger aria-label="Conta"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Data do pagamento" htmlFor="pay-date" error={errors.date}>
            <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Confirmar pagamento</Button>
      </DialogFooter>
    </form>
  );
}

function CardDialog({ editing, onClose, onSaved }: { editing: CreditCard | null | "new"; onClose: () => void; onSaved: (id: string) => void }) {
  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {editing !== null && <CardForm key={editing === "new" ? "new" : editing.id} card={editing === "new" ? null : editing} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function CardForm({ card, onClose, onSaved }: { card: CreditCard | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { data, insert, update } = useFinance();
  const [name, setName] = useState(card?.name ?? "");
  const [institution, setInstitution] = useState(card?.institution ?? "");
  const [limitAmount, setLimitAmount] = useState<number | null>(card?.limit_amount ?? null);
  const [closingDay, setClosingDay] = useState(String(card?.closing_day ?? ""));
  const [dueDay, setDueDay] = useState(String(card?.due_day ?? ""));
  const [color, setColor] = useState(card?.color ?? "#3f3f46");
  const [accountId, setAccountId] = useState<string>(card?.default_account_id ?? "none");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { name: name.trim(), institution: institution.trim() || null, limit_amount: limitAmount, closing_day: Number(closingDay), due_day: Number(dueDay), color, default_account_id: accountId === "none" ? null : accountId };
    const errs = validateCard(payload);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const row = card ? await update("credit_cards", card.id, { ...payload, limit_amount: payload.limit_amount! }) : await insert("credit_cards", { ...payload, limit_amount: payload.limit_amount! });
      toast.success(card ? "Cartão atualizado." : "Cartão cadastrado.");
      onSaved(row.id);
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
        <DialogTitle>{card ? "Editar cartão" : "Novo cartão"}</DialogTitle>
        <DialogDescription>O limite disponível é calculado automaticamente pelas compras e pagamentos.</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do cartão" htmlFor="card-name" error={errors.name}>
            <Input id="card-name" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Nubank Platinum" aria-invalid={!!errors.name || undefined} />
          </Field>
          <Field label="Instituição financeira" htmlFor="card-inst" optional>
            <Input id="card-inst" value={institution} maxLength={60} onChange={(e) => setInstitution(e.target.value)} placeholder="Ex.: Nubank" />
          </Field>
        </div>
        <Field label="Limite total" htmlFor="card-limit" error={errors.limit_amount}>
          <MoneyInput id="card-limit" value={limitAmount} onChange={setLimitAmount} invalid={!!errors.limit_amount} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Dia de fechamento" htmlFor="card-close" error={errors.closing_day}>
            <Input id="card-close" type="number" inputMode="numeric" min={1} max={31} value={closingDay} onChange={(e) => setClosingDay(e.target.value)} aria-invalid={!!errors.closing_day || undefined} />
          </Field>
          <Field label="Dia de vencimento" htmlFor="card-due" error={errors.due_day}>
            <Input id="card-due" type="number" inputMode="numeric" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} aria-invalid={!!errors.due_day || undefined} />
          </Field>
        </div>
        <Field label="Conta padrão para pagar a fatura" optional>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger aria-label="Conta padrão"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma</SelectItem>
              {data.accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
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
