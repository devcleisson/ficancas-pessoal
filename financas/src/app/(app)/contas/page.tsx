"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Archive, ArchiveRestore, Banknote, Building2, Landmark, Loader2, MoreHorizontal, Pencil, PiggyBank, Plus, Trash2, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { MoneyInput } from "@/components/money-input";
import { ColorPicker } from "@/components/color-picker";
import { Money } from "@/components/money";
import { useConfirm } from "@/components/confirm";
import { useFinance } from "@/lib/store/finance-store";
import { accountBalances } from "@/lib/finance";
import { ACCOUNT_TYPE_LABEL } from "@/lib/constants";
import { formatDate, sumMoney, todayISO } from "@/lib/format";
import { validateAccount, validateTransfer, type Errors } from "@/lib/validation";
import type { Account, AccountType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<AccountType, typeof Landmark> = { checking: Landmark, savings: PiggyBank, investment: TrendingUp, cash: Banknote, other: Building2 };

export default function AccountsPage() {
  const { data, update, remove } = useFinance();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Account | null | "new">(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const balances = useMemo(() => accountBalances(data), [data]);
  const visible = data.accounts.filter((a) => showArchived || !a.archived);
  const total = sumMoney(data.accounts.map((a) => balances.get(a.id) ?? 0));
  const archivedCount = data.accounts.filter((a) => a.archived).length;
  const transfers = [...data.transfers].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  const accName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "—";

  async function del(a: Account) {
    const ok = await confirm({ title: `Excluir a conta ${a.name}?`, description: "Só é possível excluir contas sem lançamentos vinculados. Transferências desta conta também serão excluídas." });
    if (!ok) return;
    try {
      await remove("accounts", a.id);
      toast.success("Conta excluída.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Contas e dinheiro"
        description="Contas bancárias, poupança, investimentos e dinheiro em espécie."
        actions={
          <>
            <Button variant="outline" onClick={() => setTransferOpen(true)} disabled={data.accounts.length < 2}>
              <ArrowLeftRight /> Transferir
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus /> Nova conta
            </Button>
          </>
        }
      />

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary"><Wallet className="size-5" /></span>
          <div>
            <p className="text-[13px] text-muted-foreground">Saldo total em contas</p>
            <p className="text-2xl font-semibold tracking-tight"><Money value={total} tone={total < 0 ? "expense" : "neutral"} /></p>
          </div>
        </div>
        {archivedCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((s) => !s)}>
            {showArchived ? "Ocultar arquivadas" : `Mostrar arquivadas (${archivedCount})`}
          </Button>
        )}
      </Card>

      {visible.length === 0 ? (
        <Card>
          <EmptyState icon={Landmark} title="Nenhuma conta cadastrada" description="Cadastre suas contas bancárias e o dinheiro em espécie com o saldo atual." action={<Button onClick={() => setEditing("new")}><Plus /> Nova conta</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((a) => {
            const Icon = TYPE_ICON[a.type];
            const bal = balances.get(a.id) ?? 0;
            return (
              <Card key={a.id} className={cn("p-5", a.archived && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${a.color}22`, color: a.color }}>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{ACCOUNT_TYPE_LABEL[a.type]}{a.institution ? ` · ${a.institution}` : ""}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Ações da conta ${a.name}`}><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(a)}><Pencil /> Editar</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void update("accounts", a.id, { archived: !a.archived }).then(() => toast.success(a.archived ? "Conta reativada." : "Conta arquivada.")).catch((e: Error) => toast.error(e.message))}>
                        {a.archived ? <ArchiveRestore /> : <Archive />} {a.archived ? "Reativar" : "Arquivar"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={() => void del(a)}><Trash2 /> Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="mt-5 text-xs text-muted-foreground">Saldo atual</p>
                <p className="text-xl font-semibold tracking-tight"><Money value={bal} tone={bal < 0 ? "expense" : "neutral"} /></p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  Saldo inicial <Money value={a.initial_balance} />
                  {a.archived && <Badge>Arquivada</Badge>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Transferências recentes</CardTitle>
            <CardDescription>Movimentações entre suas contas (não contam como receita nem despesa)</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-3">
          {transfers.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="Nenhuma transferência" className="py-8" />
          ) : (
            <ul className="divide-y divide-border/60">
              {transfers.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{accName(t.from_account_id)} → {accName(t.to_account_id)}</p>
                    <p className="truncate text-xs text-muted-foreground">{formatDate(t.date)}{t.description ? ` · ${t.description}` : ""}</p>
                  </div>
                  <Money value={t.amount} className="font-medium" />
                  <Button variant="ghost" size="icon-sm" aria-label="Excluir transferência" onClick={async () => {
                    if (!(await confirm({ title: "Excluir transferência?" }))) return;
                    try { await remove("transfers", t.id); toast.success("Transferência excluída."); } catch (e) { toast.error((e as Error).message); }
                  }}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>{editing !== null && <AccountForm account={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>{transferOpen && <TransferForm onClose={() => setTransferOpen(false)} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function AccountForm({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { insert, update } = useFinance();
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "checking");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [initial, setInitial] = useState<number | null>(account?.initial_balance || null);
  const [color, setColor] = useState(account?.color ?? "#10b981");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateAccount({ name, initial_balance: initial ?? 0 });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const row = { name: name.trim(), type, institution: institution.trim() || null, initial_balance: initial ?? 0, color };
    setSaving(true);
    try {
      if (account) await update("accounts", account.id, row);
      else await insert("accounts", row);
      toast.success(account ? "Conta atualizada." : "Conta cadastrada.");
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
        <DialogTitle>{account ? "Editar conta" : "Nova conta"}</DialogTitle>
        <DialogDescription>O saldo atual é calculado a partir do saldo inicial e dos lançamentos.</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" htmlFor="acc-name" error={errors.name}>
            <Input id="acc-name" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Conta Itaú" aria-invalid={!!errors.name || undefined} />
          </Field>
          <Field label="Tipo">
            <Select value={type} onValueChange={(v) => setType(v as AccountType)}>
              <SelectTrigger aria-label="Tipo de conta"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => <SelectItem key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Instituição" htmlFor="acc-inst" optional>
          <Input id="acc-inst" maxLength={60} value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Ex.: Itaú, Nubank, Caixa" />
        </Field>
        <Field label="Saldo inicial" htmlFor="acc-initial" error={errors.initial_balance} hint="Quanto havia na conta quando você começou a usar o sistema. Pode ser negativo.">
          <MoneyInput id="acc-initial" value={initial} onChange={setInitial} allowNegative invalid={!!errors.initial_balance} />
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

function TransferForm({ onClose }: { onClose: () => void }) {
  const { data, insert } = useFinance();
  const accounts = data.accounts.filter((a) => !a.archived);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateTransfer({ from_account_id: from, to_account_id: to, amount, date });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await insert("transfers", { from_account_id: from!, to_account_id: to!, amount: amount!, date, description: description.trim() || null });
      toast.success("Transferência registrada.");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const accountSelect = (value: string | null, set: (v: string) => void, label: string, error?: string) => (
    <Field label={label} error={error}>
      <Select value={value ?? undefined} onValueChange={set}>
        <SelectTrigger aria-label={label} aria-invalid={!!error || undefined}><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>Transferir entre contas</DialogTitle>
        <DialogDescription>Ex.: saque, aplicação na poupança ou envio entre bancos.</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {accountSelect(from, setFrom, "De", errors.from_account_id)}
          {accountSelect(to, setTo, "Para", errors.to_account_id)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor" htmlFor="tr-amount" error={errors.amount}>
            <MoneyInput id="tr-amount" value={amount} onChange={setAmount} invalid={!!errors.amount} />
          </Field>
          <Field label="Data" htmlFor="tr-date" error={errors.date}>
            <Input id="tr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Descrição" htmlFor="tr-desc" optional>
          <Input id="tr-desc" maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Transferir</Button>
      </DialogFooter>
    </form>
  );
}
