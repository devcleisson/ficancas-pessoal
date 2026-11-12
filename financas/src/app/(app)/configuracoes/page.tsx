"use client";

import { useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Database, Download, FileJson, FileSpreadsheet, Loader2, Moon, Pencil, Plus, Sun, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { Field } from "@/components/field";
import { ColorPicker } from "@/components/color-picker";
import { CategoryIcon, ICON_NAMES } from "@/components/category-icon";
import { useConfirm } from "@/components/confirm";
import { useFinance } from "@/lib/store/finance-store";
import { usePreferences } from "@/lib/store/preferences";
import { getSupabase } from "@/lib/supabase/client";
import {
  RESTORE_ORDER, TRANSACTION_CSV_HEADER, buildBackup, downloadFile, parseCSV, rowsToTransactions, toCSV, transactionsToRows, type ImportedRow,
} from "@/lib/export";
import { formatBRL, formatDate, todayISO } from "@/lib/format";
import { validateCategory, type Errors } from "@/lib/validation";
import type { Category, Kind, TableName, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Configurações" description="Perfil, aparência, categorias e seus dados." />
      <div className="grid gap-6 xl:grid-cols-2">
        <ProfileCard />
        <AppearanceCard />
      </div>
      <CategoriesCard />
      <DataCard />
      <DangerCard />
    </div>
  );
}

function ProfileCard() {
  const { data, user, updateProfile } = useFinance();
  const [name, setName] = useState(data.profile?.full_name ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState<"name" | "pass" | null>(null);

  return (
    <Card>
      <CardHeader><div><CardTitle>Perfil</CardTitle><CardDescription>{user?.email}</CardDescription></div></CardHeader>
      <CardContent className="grid gap-5">
        <form
          className="flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (name.trim().length > 80) return toast.error("Nome muito longo.");
            setSaving("name");
            try { await updateProfile({ full_name: name.trim() || null }); toast.success("Nome atualizado."); } catch (err) { toast.error((err as Error).message); } finally { setSaving(null); }
          }}
        >
          <Field label="Nome" htmlFor="pf-name" className="flex-1">
            <Input id="pf-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button type="submit" variant="outline" disabled={saving === "name"}>{saving === "name" && <Loader2 className="animate-spin" />} Salvar</Button>
        </form>
        <form
          className="flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) return toast.error("A senha precisa ter 8+ caracteres, com letras e números.");
            setSaving("pass");
            const { error } = await getSupabase().auth.updateUser({ password });
            setSaving(null);
            if (error) toast.error(error.message);
            else { setPassword(""); toast.success("Senha alterada."); }
          }}
        >
          <Field label="Nova senha" htmlFor="pf-pass" className="flex-1">
            <Input id="pf-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" variant="outline" disabled={saving === "pass" || !password}>{saving === "pass" && <Loader2 className="animate-spin" />} Alterar</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AppearanceCard() {
  const { resolvedTheme, setTheme } = useTheme();
  const { hideValues, toggleHideValues } = usePreferences();
  return (
    <Card>
      <CardHeader><div><CardTitle>Aparência e formato</CardTitle><CardDescription>Preferências deste navegador</CardDescription></div></CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-sm font-medium">Tema</p><p className="text-xs text-muted-foreground">Escuro é o padrão</p></div>
          <div className="inline-flex rounded-lg bg-muted p-1">
            {[["dark", "Escuro", Moon], ["light", "Claro", Sun]].map(([v, l, Icon]) => {
              const I = Icon as typeof Moon;
              return (
                <button key={v as string} type="button" onClick={() => setTheme(v as string)} aria-pressed={resolvedTheme === v}
                  className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", resolvedTheme === v ? "bg-card shadow-sm" : "text-muted-foreground")}>
                  <I className="size-3.5" /> {l as string}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-sm font-medium">Ocultar valores na tela</p><p className="text-xs text-muted-foreground">Útil em locais públicos. Também no ícone de olho no topo.</p></div>
          <Switch checked={hideValues} onCheckedChange={toggleHideValues} aria-label="Ocultar valores" />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-sm font-medium">Moeda</p><p className="text-xs text-muted-foreground">Exemplo: {formatBRL(1234.56)}</p></div>
          <Badge variant="outline">Real brasileiro (R$)</Badge>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-sm font-medium">Formato de data</p><p className="text-xs text-muted-foreground">Exemplo: {formatDate(todayISO())}</p></div>
          <Badge variant="outline">DD/MM/AAAA</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoriesCard() {
  const { data, remove } = useFinance();
  const confirm = useConfirm();
  const [kind, setKind] = useState<Kind>("expense");
  const [editing, setEditing] = useState<Category | null | "new">(null);
  const list = data.categories.filter((c) => c.kind === kind).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const usage = (id: string) => data.transactions.filter((t) => t.category_id === id).length;

  return (
    <Card>
      <CardHeader>
        <div><CardTitle>Categorias</CardTitle><CardDescription>Personalize as categorias de receitas e despesas.</CardDescription></div>
        <Button size="sm" onClick={() => setEditing("new")}><Plus /> Nova categoria</Button>
      </CardHeader>
      <CardContent>
        <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <TabsList>
            <TabsTrigger value="expense">Despesas</TabsTrigger>
            <TabsTrigger value="income">Receitas</TabsTrigger>
          </TabsList>
          <TabsContent value={kind} className="mt-4">
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((c) => {
                const n = usage(c.id);
                return (
                  <li key={c.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
                    <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{n} lançamento(s)</p>
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label={`Editar ${c.name}`} onClick={() => setEditing(c)}><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${c.name}`} onClick={async () => {
                      if (n > 0) return toast.error(`"${c.name}" tem ${n} lançamento(s). Altere a categoria deles antes de excluir.`);
                      if (!(await confirm({ title: `Excluir a categoria ${c.name}?`, description: "Limites de orçamento desta categoria também serão removidos." }))) return;
                      try { await remove("categories", c.id); toast.success("Categoria excluída."); } catch (e) { toast.error((e as Error).message); }
                    }}><Trash2 /></Button>
                  </li>
                );
              })}
            </ul>
          </TabsContent>
        </Tabs>
      </CardContent>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>{editing !== null && <CategoryForm category={editing === "new" ? null : editing} kind={kind} onClose={() => setEditing(null)} />}</DialogContent>
      </Dialog>
    </Card>
  );
}

function CategoryForm({ category, kind, onClose }: { category: Category | null; kind: Kind; onClose: () => void }) {
  const { insert, update } = useFinance();
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? "#6366f1");
  const [icon, setIcon] = useState(category?.icon ?? "circle");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateCategory({ name });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      if (category) await update("categories", category.id, { name: name.trim(), color, icon });
      else await insert("categories", { name: name.trim(), color, icon, kind });
      toast.success("Categoria salva.");
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
        <DialogTitle>{category ? "Editar categoria" : `Nova categoria de ${kind === "income" ? "receita" : "despesa"}`}</DialogTitle>
        <DialogDescription>Escolha nome, cor e ícone.</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        <Field label="Nome" htmlFor="cat-name" error={errors.name}>
          <Input id="cat-name" autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name || undefined} />
        </Field>
        <Field label="Cor"><ColorPicker value={color} onChange={setColor} /></Field>
        <Field label="Ícone">
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {ICON_NAMES.map((i) => (
              <button key={i} type="button" onClick={() => setIcon(i)} aria-label={`Ícone ${i}`} aria-pressed={icon === i} className={cn("rounded-lg ring-offset-2 ring-offset-card", icon === i && "ring-2 ring-foreground/50")}>
                <CategoryIcon icon={i} color={color} size="sm" />
              </button>
            ))}
          </div>
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Salvar</Button>
      </DialogFooter>
    </form>
  );
}

function DataCard() {
  const { data, insertMany, upsertMany, reload, user } = useFinance();
  const csvInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportedRow[] | null>(null);
  const [rawRows, setRawRows] = useState<string[][] | null>(null);
  const [defaultAccount, setDefaultAccount] = useState<string>(data.accounts[0]?.id ?? "none");
  const [busy, setBusy] = useState(false);

  const stamp = todayISO();

  function exportJSON() {
    downloadFile(`financas-backup_${stamp}.json`, JSON.stringify(buildBackup(data), null, 2), "application/json");
    toast.success("Backup exportado.");
  }

  function exportCSV() {
    const txs = [...data.transactions].sort((a, b) => a.date.localeCompare(b.date));
    downloadFile(`movimentacoes_${stamp}.csv`, toCSV([TRANSACTION_CSV_HEADER, ...transactionsToRows(txs, data)]), "text/csv;charset=utf-8");
    toast.success("Movimentações exportadas.");
  }

  function downloadTemplate() {
    downloadFile("modelo-importacao.csv", toCSV([
      ["Data", "Tipo", "Descrição", "Valor", "Categoria", "Conta", "Forma de pagamento", "Status", "Observações"],
      ["05/11/2026", "Receita", "Exemplo de receita", "1.000,00", "Salário", data.accounts[0]?.name ?? "Carteira", "Pix", "Recebida", ""],
      ["06/11/2026", "Despesa", "Exemplo de despesa", "45,90", "Alimentação", data.accounts[0]?.name ?? "Carteira", "Pix", "Paga", "apague estas linhas de exemplo"],
    ]), "text/csv;charset=utf-8");
  }

  async function onCSV(file: File) {
    if (file.size > 5_000_000) return toast.error("Arquivo muito grande (máx. 5 MB).");
    const rows = parseCSV(await file.text());
    setRawRows(rows);
    setPreview(rowsToTransactions(rows, data, defaultAccount === "none" ? null : defaultAccount));
  }

  async function confirmImport() {
    const ok = (preview ?? []).filter((r) => r.value).map((r) => r.value!) as Partial<Transaction>[];
    if (!ok.length) return;
    setBusy(true);
    try {
      for (let i = 0; i < ok.length; i += 500) await insertMany("transactions", ok.slice(i, i + 500));
      toast.success(`${ok.length} lançamento(s) importado(s).`);
      setPreview(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onJSON(file: File) {
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.app !== "financas-pessoais" || typeof parsed.data !== "object") throw new Error("Arquivo de backup inválido.");
      const src = parsed.data as Record<string, Record<string, unknown>[]>;
      // Categorias já existentes (mesmo nome e tipo) são reaproveitadas.
      const catMap = new Map<string, string>();
      const existing = new Map(data.categories.map((c) => [`${c.kind}:${c.name.toLowerCase()}`, c.id]));
      const newCats: Record<string, unknown>[] = [];
      for (const c of src.categories ?? []) {
        const hit = existing.get(`${c.kind}:${String(c.name).toLowerCase()}`);
        if (hit) catMap.set(String(c.id), hit);
        else newCats.push(c);
      }
      const fix = (row: Record<string, unknown>): Record<string, unknown> => {
        const r: Record<string, unknown> = { ...row, user_id: user!.id };
        if (typeof r.category_id === "string" && catMap.has(r.category_id)) r.category_id = catMap.get(r.category_id);
        return r;
      };
      let total = 0;
      for (const table of RESTORE_ORDER) {
        const rows = (table === "categories" ? newCats : src[table] ?? []).map(fix);
        if (table === "budgets") {
          // Um limite por categoria: ignora limites de categorias que já têm limite.
          const has = new Set(data.budgets.map((b) => b.category_id));
          const filtered = rows.filter((r) => !has.has(String(r.category_id)) || data.budgets.some((b) => b.id === r.id));
          await upsertMany(table as TableName, filtered as never[]);
          total += filtered.length;
          continue;
        }
        await upsertMany(table as TableName, rows as never[]);
        total += rows.length;
      }
      await reload();
      toast.success(`Backup restaurado (${total} registros).`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const valid = preview?.filter((r) => r.value).length ?? 0;
  const invalid = preview?.filter((r) => r.error) ?? [];

  return (
    <Card>
      <CardHeader><div><CardTitle>Importação e exportação</CardTitle><CardDescription>Seus dados são seus: exporte, faça backup ou importe de outras ferramentas.</CardDescription></div></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-3 rounded-xl border border-border p-4">
          <p className="flex items-center gap-2 text-sm font-medium"><Download className="size-4" /> Exportar</p>
          <Button variant="outline" className="justify-start" onClick={exportCSV}><FileSpreadsheet /> Movimentações (CSV / Excel)</Button>
          <Button variant="outline" className="justify-start" onClick={exportJSON}><FileJson /> Backup completo (JSON)</Button>
        </div>
        <div className="grid gap-3 rounded-xl border border-border p-4">
          <p className="flex items-center gap-2 text-sm font-medium"><Upload className="size-4" /> Importar</p>
          <Button variant="outline" className="justify-start" onClick={() => csvInput.current?.click()}><FileSpreadsheet /> Movimentações de um CSV</Button>
          <Button variant="outline" className="justify-start" disabled={busy} onClick={() => jsonInput.current?.click()}>{busy ? <Loader2 className="animate-spin" /> : <Database />} Restaurar backup (JSON)</Button>
          <button type="button" onClick={downloadTemplate} className="justify-self-start text-xs text-muted-foreground underline-offset-4 hover:underline">Baixar modelo de CSV</button>
          <input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onCSV(f); }} />
          <input ref={jsonInput} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onJSON(f); }} />
        </div>
      </CardContent>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Revisar importação</DialogTitle>
            <DialogDescription>{valid} lançamento(s) prontos para importar{invalid.length ? ` · ${invalid.length} linha(s) com erro serão ignoradas` : ""}.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Conta padrão (quando a coluna Conta estiver vazia)">
              <Select value={defaultAccount} onValueChange={(v) => { setDefaultAccount(v); if (rawRows) setPreview(rowsToTransactions(rawRows, data, v === "none" ? null : v)); }}>
                <SelectTrigger aria-label="Conta padrão"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {data.accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-muted-foreground"><th className="p-2">Linha</th><th className="p-2">Data</th><th className="p-2">Descrição</th><th className="p-2 text-right">Valor</th><th className="p-2">Situação</th></tr>
                </thead>
                <tbody>
                  {preview?.map((r) => (
                    <tr key={r.line} className="border-b border-border/50 last:border-0">
                      <td className="p-2 text-muted-foreground">{r.line}</td>
                      <td className="p-2">{r.value ? formatDate(r.value.date!) : "—"}</td>
                      <td className="max-w-48 truncate p-2">{r.description ?? "—"}</td>
                      <td className={cn("p-2 text-right tabular", r.value?.kind === "income" ? "text-income" : "text-expense")}>{r.value ? formatBRL(r.value.amount!) : "—"}</td>
                      <td className="p-2">{r.error ? <span className="text-expense">{r.error}</span> : <span className="text-income">OK{!r.value?.category_id && " · sem categoria"}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancelar</Button>
            <Button disabled={!valid || busy} onClick={() => void confirmImport()}>{busy && <Loader2 className="animate-spin" />} Importar {valid} lançamento(s)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DangerCard() {
  const { data, removeWhere, reload, user } = useFinance();
  const confirm = useConfirm();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function wipe() {
    if (text !== "APAGAR") return;
    if (!(await confirm({ title: "Apagar todos os dados?", description: "Todas as movimentações, contas, cartões, metas e configurações serão excluídas permanentemente. Faça um backup antes.", confirmText: "Apagar tudo" }))) return;
    setBusy(true);
    try {
      const order: TableName[] = ["goal_contributions", "budgets", "card_payments", "transfers", "transactions", "recurring_bills", "goals", "credit_cards", "accounts"];
      for (const t of order) await removeWhere(t, "user_id", user!.id);
      // Mantém as categorias padrão; remove apenas as personalizadas.
      for (const c of data.categories.filter((c) => !c.is_default)) await removeWhere("categories", "id", c.id);
      await reload();
      setText("");
      toast.success("Todos os dados foram apagados.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-expense/30">
      <CardHeader><div><CardTitle className="text-expense">Zona de perigo</CardTitle><CardDescription>Apaga todos os seus lançamentos e cadastros. As categorias padrão são mantidas.</CardDescription></div></CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label='Digite "APAGAR" para confirmar' htmlFor="wipe" className="flex-1 sm:max-w-xs">
          <Input id="wipe" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </Field>
        <Button variant="destructive" disabled={text !== "APAGAR" || busy} onClick={() => void wipe()}>{busy && <Loader2 className="animate-spin" />} Apagar todos os dados</Button>
      </CardContent>
    </Card>
  );
}
