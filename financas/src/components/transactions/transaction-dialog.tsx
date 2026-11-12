"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/field";
import { MoneyInput } from "@/components/money-input";
import { CategoryIcon } from "@/components/category-icon";
import { useFinance } from "@/lib/store/finance-store";
import { EXPENSE_METHODS, INCOME_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { addMonths, formatBRL, todayISO } from "@/lib/format";
import { invoiceMonthFor, splitInstallments } from "@/lib/finance";
import { validateTransaction, type Errors } from "@/lib/validation";
import { formatMonth } from "@/lib/format";
import type { ExpenseType, Kind, PaymentMethod, Transaction, TxStatus } from "@/lib/types";
import { cn, uuid } from "@/lib/utils";

export interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: Kind;
  editing?: Transaction | null;
  /** Valores iniciais para um novo lançamento. */
  defaults?: Partial<Transaction>;
}

export function TransactionDialog(props: TransactionDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {props.open && <TransactionForm key={props.editing?.id ?? "new"} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function TransactionForm({ kind: initialKind, editing, defaults, onOpenChange }: TransactionDialogProps) {
  const { data, insert, insertMany, update } = useFinance();
  const base = editing ?? defaults ?? {};
  const kind: Kind = editing?.kind ?? initialKind;
  const isIncome = kind === "income";

  const activeAccounts = data.accounts.filter((a) => !a.archived || a.id === base.account_id);
  const activeCards = data.cards.filter((c) => !c.archived || c.id === base.card_id);
  const categories = data.categories.filter((c) => c.kind === kind);

  const [description, setDescription] = useState(base.description ?? "");
  const [amount, setAmount] = useState<number | null>(base.amount ?? null);
  const [date, setDate] = useState(base.date ?? todayISO());
  const [categoryId, setCategoryId] = useState<string | null>(base.category_id ?? null);
  const [method, setMethod] = useState<PaymentMethod>(base.payment_method ?? "pix");
  const [accountId, setAccountId] = useState<string | null>(
    base.account_id ?? (base.card_id ? null : activeAccounts.length === 1 ? activeAccounts[0].id : null),
  );
  const [cardId, setCardId] = useState<string | null>(base.card_id ?? (activeCards.length === 1 ? activeCards[0].id : null));
  const [status, setStatus] = useState<TxStatus>(base.status ?? "paid");
  const [expenseType, setExpenseType] = useState<ExpenseType>(base.expense_type ?? "variable");
  const [source, setSource] = useState(base.source ?? "");
  const [notes, setNotes] = useState(base.notes ?? "");
  const [installments, setInstallments] = useState(1);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const isCard = !isIncome && method === "credit";
  const isInstallmentRow = !!editing?.installment_group;
  const methods = isIncome ? INCOME_METHODS : EXPENSE_METHODS;
  const selectedCard = activeCards.find((c) => c.id === cardId);

  const installmentPreview = useMemo(() => {
    if (!isCard || !amount || installments < 2) return null;
    const parts = splitInstallments(amount, installments);
    return `${installments}x de ${formatBRL(parts[parts.length - 1])}${parts[0] !== parts[parts.length - 1] ? ` (1ª de ${formatBRL(parts[0])})` : ""}`;
  }, [isCard, amount, installments]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      kind,
      description: description.trim(),
      amount,
      date,
      category_id: categoryId,
      account_id: isCard ? null : accountId,
      card_id: isCard ? cardId : null,
      payment_method: method,
      status: isCard ? ("paid" as const) : status,
      notes: notes.trim() || null,
      source: isIncome ? source.trim() || null : null,
      installments: isCard && !editing ? installments : undefined,
    };
    const errs = validateTransaction(payload);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const row: Partial<Transaction> = {
      kind: payload.kind,
      description: payload.description,
      amount: payload.amount!,
      date: payload.date,
      category_id: payload.category_id,
      account_id: payload.account_id,
      card_id: payload.card_id,
      payment_method: payload.payment_method,
      status: payload.status,
      notes: payload.notes,
      source: payload.source,
      expense_type: isIncome ? null : expenseType,
    };

    setSaving(true);
    try {
      if (editing) {
        await update("transactions", editing.id, row);
        toast.success("Lançamento atualizado.");
      } else if (isCard && installments > 1) {
        const group = uuid();
        const parts = splitInstallments(payload.amount!, installments);
        await insertMany(
          "transactions",
          parts.map((value, i) => ({
            ...row,
            amount: value,
            date: addMonths(payload.date, i),
            installment_group: group,
            installment_number: i + 1,
            installment_total: installments,
          })),
        );
        toast.success(`Compra parcelada em ${installments}x registrada.`);
      } else {
        await insert("transactions", row);
        toast.success(isIncome ? "Receita cadastrada." : "Despesa cadastrada.");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const title = editing ? (isIncome ? "Editar receita" : "Editar despesa") : isIncome ? "Nova receita" : "Nova despesa";

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-col" noValidate>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {isInstallmentRow
            ? `Parcela ${editing!.installment_number} de ${editing!.installment_total}. As alterações valem só para esta parcela.`
            : isIncome
              ? "Registre um valor recebido ou a receber."
              : "Registre um gasto pago ou a pagar."}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Field label={isIncome ? "Descrição" : "Nome da despesa"} htmlFor="tx-desc" error={errors.description}>
            <Input
              id="tx-desc"
              autoFocus
              value={description}
              maxLength={120}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isIncome ? "Ex.: Salário de novembro" : "Ex.: Supermercado"}
              aria-invalid={!!errors.description || undefined}
            />
          </Field>
          <Field label={isCard && installments > 1 ? "Valor total" : "Valor"} htmlFor="tx-amount" error={errors.amount}>
            <MoneyInput id="tx-amount" value={amount} onChange={setAmount} invalid={!!errors.amount} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoria" error={errors.category_id}>
            <Select value={categoryId ?? undefined} onValueChange={setCategoryId}>
              <SelectTrigger aria-invalid={!!errors.category_id || undefined} aria-label="Categoria">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <CategoryIcon icon={c.icon} color={c.color} size="sm" className="size-5 rounded-md [&_svg]:size-3" />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={isIncome ? "Data de recebimento" : isCard ? "Data da compra" : "Data"} htmlFor="tx-date" error={errors.date}>
            <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors.date || undefined} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={isIncome ? "Forma de recebimento" : "Forma de pagamento"}>
            <Select
              value={method}
              onValueChange={(v) => setMethod(v as PaymentMethod)}
              disabled={isInstallmentRow}
            >
              <SelectTrigger aria-label="Forma de pagamento">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {methods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {isCard ? (
            <Field label="Cartão" error={errors.card_id}>
              {activeCards.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                  Nenhum cartão cadastrado.{" "}
                  <Link href="/cartoes" className="text-primary underline" onClick={() => onOpenChange(false)}>
                    Cadastrar cartão
                  </Link>
                </p>
              ) : (
                <Select value={cardId ?? undefined} onValueChange={setCardId} disabled={isInstallmentRow}>
                  <SelectTrigger aria-invalid={!!errors.card_id || undefined} aria-label="Cartão">
                    <SelectValue placeholder="Selecione o cartão" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCards.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          ) : (
            <Field label={isIncome ? "Conta de destino" : "Conta de origem"} error={errors.account_id} optional={status === "pending"}>
              {activeAccounts.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                  Nenhuma conta cadastrada.{" "}
                  <Link href="/contas" className="text-primary underline" onClick={() => onOpenChange(false)}>
                    Cadastrar conta
                  </Link>
                </p>
              ) : (
                <Select value={accountId ?? undefined} onValueChange={setAccountId}>
                  <SelectTrigger aria-invalid={!!errors.account_id || undefined} aria-label="Conta">
                    <SelectValue placeholder="Selecione a conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          )}
        </div>

        {isCard && !editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Parcelas" error={errors.installments}>
              <Select value={String(installments)} onValueChange={(v) => setInstallments(Number(v))}>
                <SelectTrigger aria-label="Parcelas">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n === 1 ? "À vista" : `${n}x`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="self-end pb-2 text-xs text-muted-foreground">
              {installmentPreview ?? (selectedCard && date ? `Entra na fatura de ${formatMonth(invoiceMonthFor(date, selectedCard))}.` : null)}
            </div>
          </div>
        )}

        {!isCard && (
          <Segmented
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as TxStatus)}
            options={
              isIncome
                ? [
                    { value: "paid", label: "Recebida" },
                    { value: "pending", label: "A receber" },
                  ]
                : [
                    { value: "paid", label: "Paga" },
                    { value: "pending", label: "Pendente" },
                  ]
            }
          />
        )}

        {!isIncome && (
          <Segmented
            label="Tipo de despesa"
            value={expenseType}
            onChange={(v) => setExpenseType(v as ExpenseType)}
            options={[
              { value: "variable", label: "Variável" },
              { value: "fixed", label: "Fixa" },
            ]}
          />
        )}

        {isIncome && (
          <Field label="Origem da receita" htmlFor="tx-source" optional error={errors.source}>
            <Input id="tx-source" value={source} maxLength={80} onChange={(e) => setSource(e.target.value)} placeholder="Ex.: Empresa XYZ, cliente, plataforma" />
          </Field>
        )}

        <Field label={isIncome ? "Observações" : "Descrição ou observação"} htmlFor="tx-notes" optional error={errors.notes}>
          <Textarea id="tx-notes" rows={2} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {editing ? "Salvar alterações" : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Segmented({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] font-medium text-foreground/90">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex w-full rounded-lg bg-muted p-1 sm:w-auto sm:justify-self-start">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none",
              value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
