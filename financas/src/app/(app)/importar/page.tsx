"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeftRight, Check, CheckCircle2, ChevronDown, FileUp, Info, Loader2, RotateCcw, Sparkles, Upload, X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { Field } from "@/components/field";
import { CategoryIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { useFinance } from "@/lib/store/finance-store";
import {
  buildHistory, csvToRows, decodeFile, findDuplicates, guessMethod, merchantKey, parseDelimited, parseStatement, suggestCategory,
  type CsvLayout, type DuplicateState, type ParsedStatement,
} from "@/lib/statement";
import { formatDate, sumMoney } from "@/lib/format";
import type { Kind, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Override {
  include?: boolean;
  categoryId?: string | null;
  /** "manual" = escolhida pelo usuário; "similar" = copiada de um lançamento parecido. */
  by?: "manual" | "similar";
}

type View = "all" | "new" | "dup" | "nocat";

export default function ImportPage() {
  const { data, insertMany } = useFinance();
  const inputRef = useRef<HTMLInputElement>(null);
  const [destination, setDestination] = useState<string>(() => data.accounts.find((a) => !a.archived)?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [rawCsv, setRawCsv] = useState<string[][] | null>(null);
  const [invert, setInvert] = useState(false);
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  const [view, setView] = useState<View>("all");
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ count: number; uncategorized: number } | null>(null);
  const [showColumns, setShowColumns] = useState(false);

  const accounts = data.accounts.filter((a) => !a.archived);
  const cards = data.cards.filter((c) => !c.archived);
  const isCard = cards.some((c) => c.id === destination);
  const destName = isCard ? cards.find((c) => c.id === destination)?.name : accounts.find((a) => a.id === destination)?.name;
  const history = useMemo(() => buildHistory(data.transactions), [data.transactions]);
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);

  const rows = useMemo(() => {
    if (!parsed) return [];
    const base = parsed.rows.map((r) => ({ ...r, amount: invert ? -r.amount : r.amount }));
    const existing = data.transactions.filter((t) => (isCard ? t.card_id === destination : t.account_id === destination && !t.card_id));
    const dups = findDuplicates(base, existing);
    return base.map((r, i) => {
      const kind: Kind = r.amount < 0 ? "expense" : "income";
      const blocked = isCard && kind === "income";
      const sug = suggestCategory(r, kind, data.categories, history);
      const o = overrides[r.index] ?? {};
      const dup: DuplicateState = dups[i];
      return {
        ...r,
        kind,
        blocked,
        dup,
        include: blocked ? false : (o.include ?? dup === "new"),
        categoryId: o.categoryId !== undefined ? o.categoryId : sug.categoryId,
        source: o.by ?? (o.categoryId === undefined ? sug.source : null),
        key: merchantKey(r.description),
      };
    });
  }, [parsed, invert, data.transactions, data.categories, isCard, destination, history, overrides]);

  const selected = rows.filter((r) => r.include);
  const stats = {
    selected: selected.length,
    dup: rows.filter((r) => r.dup !== "new").length,
    noCat: selected.filter((r) => !r.categoryId).length,
    income: sumMoney(selected.filter((r) => r.kind === "income").map((r) => r.amount)),
    expense: sumMoney(selected.filter((r) => r.kind === "expense").map((r) => -r.amount)),
  };
  const visibleRows = rows.filter((r) =>
    view === "all" ? true : view === "new" ? r.dup === "new" && !r.blocked : view === "dup" ? r.dup !== "new" : !r.categoryId && !r.blocked,
  );

  async function readFile(file: File) {
    if (file.size > 10_000_000) return toast.error("Arquivo muito grande (máximo 10 MB).");
    const text = decodeFile(await file.arrayBuffer());
    const result = parseStatement(text, file.name);
    if ("error" in result) {
      toast.error(`${result.error} Verifique se o arquivo é o extrato em OFX ou CSV.`);
      return;
    }
    setFileName(file.name);
    setParsed(result);
    setRawCsv(result.format === "csv" ? parseDelimited(text) : null);
    setOverrides({});
    setView("all");
    setDone(null);
    // Extrato de cartão (OFX de cartão ou CSV com compras positivas): ajusta destino/sinal.
    const positives = result.rows.filter((r) => r.amount > 0).length;
    const cardFile = result.accountType === "creditcard";
    if (cardFile && cards.length && !isCard) setDestination(cards[0].id);
    setInvert((cardFile || isCard) && positives > result.rows.length / 2);
    toast.success(`${result.rows.length} lançamento(s) encontrados${result.skipped ? ` · ${result.skipped} linha(s) ignorada(s)` : ""}.`);
  }

  function changeLayout(patch: Partial<CsvLayout>) {
    if (!rawCsv || !parsed?.csv) return;
    const layout = { ...parsed.csv, ...patch };
    if (patch.amount !== undefined && patch.amount >= 0) Object.assign(layout, { credit: -1, debit: -1 });
    setParsed(csvToRows(rawCsv, layout));
    setOverrides({});
  }

  function setOverride(index: number, o: Override) {
    setOverrides((cur) => ({ ...cur, [index]: { ...cur[index], ...o } }));
  }

  /** Muda a categoria de uma linha e copia para as parecidas que o usuário ainda não mexeu. */
  function changeCategory(index: number, categoryId: string) {
    const row = rows.find((r) => r.index === index);
    if (!row) return;
    const similar = rows.filter((r) => r.index !== index && r.kind === row.kind && r.key && r.key === row.key && overrides[r.index]?.by !== "manual" && r.categoryId !== categoryId);
    setOverrides((cur) => {
      const next = { ...cur, [index]: { ...cur[index], categoryId, by: "manual" as const } };
      for (const s of similar) next[s.index] = { ...cur[s.index], categoryId, by: "similar" };
      return next;
    });
    if (similar.length) toast.message(`Categoria aplicada também a ${similar.length} lançamento(s) parecido(s).`);
  }

  function bulkCategory(categoryId: string) {
    const cat = catById.get(categoryId);
    if (!cat) return;
    const target = selected.filter((r) => r.kind === cat.kind);
    setOverrides((cur) => {
      const next = { ...cur };
      for (const r of target) next[r.index] = { ...cur[r.index], categoryId, by: "manual" };
      return next;
    });
    toast.success(`"${cat.name}" aplicada a ${target.length} lançamento(s).`);
  }

  function toggleAll(value: boolean) {
    setOverrides((cur) => {
      const next = { ...cur };
      for (const r of visibleRows) if (!r.blocked) next[r.index] = { ...cur[r.index], include: value };
      return next;
    });
  }

  async function doImport() {
    if (!destination) return toast.error("Escolha a conta ou o cartão de destino.");
    if (!selected.length) return toast.error("Nenhum lançamento selecionado.");
    const payload: Partial<Transaction>[] = selected.map((r) => ({
      kind: r.kind,
      description: r.description.trim() || "Lançamento",
      amount: Math.abs(r.amount),
      date: r.date,
      category_id: r.categoryId ?? null,
      account_id: isCard ? null : destination,
      card_id: isCard ? destination : null,
      payment_method: isCard ? "credit" : guessMethod(r.description, r.kind),
      status: "paid",
      expense_type: r.kind === "expense" ? "variable" : null,
      notes: null,
      source: null,
    }));
    setSaving(true);
    try {
      for (let i = 0; i < payload.length; i += 500) await insertMany("transactions", payload.slice(i, i + 500));
      setDone({ count: payload.length, uncategorized: stats.noCat });
      setParsed(null);
      setRawCsv(null);
      setOverrides({});
      toast.success(`${payload.length} lançamento(s) importado(s) em ${destName}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const reset = () => {
    setParsed(null);
    setRawCsv(null);
    setOverrides({});
    setFileName("");
    setDone(null);
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Importar extrato"
        description="Envie o extrato do banco ou a fatura do cartão (OFX ou CSV). Você revisa tudo antes de salvar."
        actions={parsed ? <Button variant="outline" onClick={reset}><RotateCcw /> Outro arquivo</Button> : undefined}
      />

      {done && (
        <Card className="border-income/30 bg-income/[0.06]">
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <CheckCircle2 className="size-8 shrink-0 text-income" />
            <div className="flex-1">
              <p className="font-semibold">{done.count} lançamento(s) importado(s)</p>
              <p className="text-sm text-muted-foreground">
                {done.uncategorized ? `${done.uncategorized} ficaram sem categoria. Você pode categorizar vários de uma vez em Movimentações.` : "Tudo categorizado. Os indicadores e gráficos já foram atualizados."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {done.uncategorized > 0 && (
                <Button asChild><Link href="/movimentacoes?categoria=sem">Categorizar agora</Link></Button>
              )}
              <Button variant="outline" asChild><Link href="/movimentacoes">Ver movimentações</Link></Button>
              <Button variant="ghost" onClick={reset}>Importar outro</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!parsed && !done && (
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <Card>
            <CardContent className="grid gap-5">
              <Field label="Para onde vão os lançamentos?" hint="Extrato da conta → escolha a conta. Fatura do cartão → escolha o cartão.">
                <DestinationSelect value={destination} onChange={setDestination} />
              </Field>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void readFile(f);
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
                  dragging ? "border-primary bg-primary/[0.06]" : "border-border hover:border-primary/50 hover:bg-muted/40",
                )}
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary"><Upload className="size-5" /></span>
                <span className="font-medium">Arraste o arquivo aqui ou clique para escolher</span>
                <span className="text-sm text-muted-foreground">Formatos aceitos: OFX (recomendado) e CSV</span>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".ofx,.qfx,.csv,.txt,application/x-ofx,text/csv"
                  className="sr-only"
                  aria-label="Arquivo do extrato"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void readFile(f);
                  }}
                />
              </label>
              {!accounts.length && !cards.length && (
                <p className="text-sm text-expense">Cadastre uma conta em <Link className="underline" href="/contas">Contas</Link> antes de importar.</p>
              )}
            </CardContent>
          </Card>
          <Card className="self-start">
            <CardHeader><div><CardTitle>Como baixar o extrato</CardTitle><CardDescription>Funciona com a maioria dos bancos</CardDescription></div></CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground">
              <ol className="grid list-decimal gap-2 pl-4">
                <li>No site ou app do banco, abra o <b className="text-foreground">Extrato</b> da conta (ou a <b className="text-foreground">Fatura</b> do cartão).</li>
                <li>Escolha o período e procure <b className="text-foreground">Exportar</b>, <b className="text-foreground">Baixar</b> ou <b className="text-foreground">Salvar extrato</b>.</li>
                <li>Prefira o formato <b className="text-foreground">OFX</b> (às vezes chamado de “Money” ou “Quicken”). Se não houver, use <b className="text-foreground">CSV</b>.</li>
                <li>Envie o arquivo aqui. Nada é salvo antes de você revisar e confirmar.</li>
              </ol>
              <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-xs">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                Pode importar o mesmo período mais de uma vez: lançamentos que já existem são reconhecidos e ficam desmarcados.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {parsed && (
        <>
          <Card className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Arquivo">
                <p className="flex h-9 items-center gap-2 truncate rounded-lg border border-border px-3 text-sm">
                  <FileUp className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{fileName}</span>
                  <Badge variant="outline" className="ml-auto">{parsed.format.toUpperCase()}</Badge>
                </p>
              </Field>
              <Field label="Destino">
                <DestinationSelect value={destination} onChange={setDestination} />
              </Field>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <ArrowLeftRight className="size-4 text-muted-foreground" />
              Inverter entradas e saídas
              <Switch checked={invert} onCheckedChange={setInvert} aria-label="Inverter entradas e saídas" />
            </label>
            {isCard && (
              <p className="text-xs text-muted-foreground lg:col-span-2">
                Fatura de cartão: as compras entram como despesas no cartão {destName}. Pagamentos e estornos da fatura não são importados. Se as compras aparecerem como entradas, ligue “Inverter”.
              </p>
            )}
            {parsed.format === "csv" && parsed.csv && (
              <div className="lg:col-span-2">
                <button type="button" onClick={() => setShowColumns((v) => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <ChevronDown className={cn("size-3.5 transition-transform", showColumns && "rotate-180")} /> Colunas do arquivo (ajuste se algo estiver errado)
                </button>
                {showColumns && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <ColumnSelect label="Data" value={parsed.csv.date} headers={parsed.csv.headers} onChange={(v) => changeLayout({ date: v })} />
                    <ColumnSelect label="Descrição" value={parsed.csv.description} headers={parsed.csv.headers} onChange={(v) => changeLayout({ description: v, description2: -1 })} />
                    <ColumnSelect label="Valor" value={parsed.csv.amount} headers={parsed.csv.headers} onChange={(v) => changeLayout({ amount: v })} />
                  </div>
                )}
              </div>
            )}
          </Card>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Selecionados para importar" value={`${stats.selected} de ${rows.length}`} />
            <Stat label="Entradas" value={<Money value={stats.income} tone="income" />} />
            <Stat label="Saídas" value={<Money value={stats.expense} tone="expense" />} />
            <Stat label="Já existentes (desmarcados)" value={String(stats.dup)} tone={stats.dup ? "warning" : undefined} />
          </section>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <div className="inline-flex rounded-lg bg-muted p-1 text-sm" role="tablist" aria-label="Filtrar lançamentos">
                {([["all", `Todos (${rows.length})`], ["new", "Novos"], ["dup", `Já existentes (${stats.dup})`], ["nocat", "Sem categoria"]] as [View, string][]).map(([v, l]) => (
                  <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                    className={cn("rounded-md px-3 py-1 font-medium", view === v ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => toggleAll(true)}><Check /> Marcar visíveis</Button>
                <Button size="sm" variant="ghost" onClick={() => toggleAll(false)}><X /> Desmarcar visíveis</Button>
                <CategoryPicker
                  placeholder="Categoria p/ selecionados…"
                  ariaLabel="Definir categoria dos selecionados"
                  kinds={new Set(selected.map((r) => r.kind))}
                  value={null}
                  onChange={bulkCategory}
                  className="w-56"
                />
              </div>
            </div>

            {visibleRows.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum lançamento neste filtro.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {visibleRows.map((r) => (
                  <li key={r.index} className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[auto_90px_minmax(0,1fr)_220px_130px]", !r.include && "opacity-55")}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={r.include}
                      aria-label={`Importar ${r.description}`}
                      disabled={r.blocked}
                      onClick={() => setOverride(r.index, { include: !r.include })}
                      className={cn("flex size-5 items-center justify-center rounded-md border", r.include ? "border-primary bg-primary text-primary-foreground" : "border-input", r.blocked && "cursor-not-allowed")}
                    >
                      {r.include && <Check className="size-3.5" />}
                    </button>
                    <span className="hidden text-xs text-muted-foreground tabular md:block">{formatDate(r.date)}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.description}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="md:hidden">{formatDate(r.date)}</span>
                        {r.blocked && <Badge>Pagamento/estorno · não importado no cartão</Badge>}
                        {r.dup === "duplicate" && <Badge variant="warning">Já importado</Badge>}
                        {r.dup === "possible" && <Badge variant="warning">Possível duplicado</Badge>}
                        {r.categoryId && r.source && r.source !== "manual" && (
                          <span className="inline-flex items-center gap-1 text-primary"><Sparkles className="size-3" />{r.source === "similar" ? "igual a um parecido" : r.source === "history" ? "pelo seu histórico" : r.source === "file" ? "do arquivo" : "sugerida"}</span>
                        )}
                      </p>
                    </div>
                    <Money value={r.amount} tone={r.kind === "income" ? "income" : "expense"} sign className="text-right text-sm font-semibold md:order-last" />
                    <div className="col-span-3 md:col-span-1 md:col-start-4 md:row-start-1">
                      {!r.blocked && (
                        <CategoryPicker
                          ariaLabel={`Categoria de ${r.description}`}
                          kinds={new Set([r.kind])}
                          value={r.categoryId}
                          onChange={(id) => changeCategory(r.index, id)}
                          placeholder="Sem categoria"
                          warn={!r.categoryId}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur sm:flex-row sm:items-center">
            <p className="flex-1 text-sm">
              <b>{stats.selected}</b> lançamento(s) serão importados em <b>{destName ?? "—"}</b>
              {stats.noCat > 0 && <span className="text-warning"> · {stats.noCat} sem categoria (pode categorizar depois)</span>}
            </p>
            <Button variant="outline" onClick={reset}>Cancelar</Button>
            <Button onClick={() => void doImport()} disabled={saving || !stats.selected || !destination}>
              {saving ? <Loader2 className="animate-spin" /> : <Upload />} Importar {stats.selected} lançamento(s)
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warning" }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tabular", tone === "warning" && "text-warning")}>{value}</p>
    </Card>
  );
}

function DestinationSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useFinance();
  const accounts = data.accounts.filter((a) => !a.archived);
  const cards = data.cards.filter((c) => !c.archived);
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger aria-label="Destino da importação"><SelectValue placeholder="Escolha a conta ou o cartão" /></SelectTrigger>
      <SelectContent>
        {accounts.length > 0 && (
          <SelectGroup>
            <SelectLabel>Contas</SelectLabel>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectGroup>
        )}
        {cards.length > 0 && (
          <SelectGroup>
            <SelectLabel>Cartões de crédito</SelectLabel>
            {cards.map((c) => <SelectItem key={c.id} value={c.id}>Cartão {c.name}</SelectItem>)}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

function ColumnSelect({ label, value, headers, onChange }: { label: string; value: number; headers: string[]; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <Select value={value >= 0 ? String(value) : undefined} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger aria-label={`Coluna de ${label}`}><SelectValue placeholder="Escolha a coluna" /></SelectTrigger>
        <SelectContent>
          {headers.map((h, i) => <SelectItem key={i} value={String(i)}>{h || `Coluna ${i + 1}`}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

function CategoryPicker({
  value, onChange, kinds, placeholder, ariaLabel, className, warn,
}: {
  value: string | null;
  onChange: (id: string) => void;
  kinds: Set<Kind>;
  placeholder: string;
  ariaLabel: string;
  className?: string;
  warn?: boolean;
}) {
  const { data } = useFinance();
  const list = data.categories.filter((c) => kinds.size === 0 || kinds.has(c.kind)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} className={cn("h-8", warn && "border-warning/50 text-warning", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {list.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <span className="flex items-center gap-2">
              <CategoryIcon icon={c.icon} color={c.color} size="sm" className="size-5 rounded-md [&_svg]:size-3" />
              {c.name}
              {kinds.size !== 1 && <span className="text-xs text-muted-foreground">({c.kind === "income" ? "receita" : "despesa"})</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
