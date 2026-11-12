"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight, FileDown, FileSpreadsheet, Loader2, PiggyBank, Scale } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { MonthSwitcher } from "@/components/month-switcher";
import { StatCard } from "@/components/stat-card";
import { CategoryIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { EmptyState } from "@/components/empty-state";
import { HistoryChart, SeriesChart } from "@/components/charts";
import { TransactionsTable } from "@/components/transactions/transactions-list";
import { useFinance } from "@/lib/store/finance-store";
import { categoryBreakdown, monthlyHistory, percentChange, summarizePeriod } from "@/lib/finance";
import {
  addMonths, capitalize, formatBRL, formatDate, formatMonth, formatPercent, isValidISODate, monthEnd, monthKey, monthRange, shiftMonth, todayISO,
} from "@/lib/format";
import { TRANSACTION_CSV_HEADER, downloadFile, toCSV, transactionsToRows } from "@/lib/export";
import { cn } from "@/lib/utils";

type Mode = "month" | "year" | "custom";

export default function ReportsPage() {
  const { data } = useFinance();
  const today = todayISO();
  const [mode, setMode] = useState<Mode>("month");
  const [month, setMonth] = useState(monthKey(today));
  const [year, setYear] = useState(today.slice(0, 4));
  const [from, setFrom] = useState(addMonths(today, -2).slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [exporting, setExporting] = useState(false);

  const range = useMemo(() => {
    if (mode === "month") return { from: `${month}-01`, to: monthEnd(month), label: capitalize(formatMonth(month)) };
    if (mode === "year") return { from: `${year}-01-01`, to: `${year}-12-31`, label: `Ano de ${year}` };
    const f = isValidISODate(from) ? from : today;
    const t = isValidISODate(to) && to >= f ? to : f;
    return { from: f, to: t, label: `${formatDate(f)} a ${formatDate(t)}` };
  }, [mode, month, year, from, to, today]);

  /** Meses usados nos comparativos: o próprio período ou, no modo mensal, os 6 meses até o selecionado. */
  const months = useMemo(() => {
    if (mode === "month") return monthRange(shiftMonth(month, -5), month);
    return monthRange(monthKey(range.from), monthKey(range.to));
  }, [mode, month, range]);

  const r = useMemo(() => {
    const summary = summarizePeriod(data.transactions, range.from, range.to);
    const history = monthlyHistory(data, months);
    const categories = categoryBreakdown(data.transactions, data.categories, "expense", range.from, range.to);
    const incomeCats = categoryBreakdown(data.transactions, data.categories, "income", range.from, range.to);
    const txs = data.transactions.filter((t) => t.date >= range.from && t.date <= range.to).sort((a, b) => b.date.localeCompare(a.date));
    return { summary, history, categories, incomeCats, txs };
  }, [data, range, months]);

  const years = useMemo(() => {
    const set = new Set<string>([today.slice(0, 4)]);
    data.transactions.forEach((t) => set.add(t.date.slice(0, 4)));
    return [...set].sort().reverse();
  }, [data.transactions, today]);

  const fileBase = `relatorio-financeiro_${range.from}_${range.to}`;

  function exportCSV() {
    const s = r.summary;
    const rows: (string | number)[][] = [
      ["Relatório financeiro", range.label],
      [],
      ["Resumo"],
      ["Receitas", formatBRL(s.income)],
      ["Despesas", formatBRL(s.expense)],
      ["Resultado", formatBRL(s.result)],
      ["Taxa de economia", s.savingsRate == null ? "-" : formatPercent(s.savingsRate)],
      [],
      ["Comparativo mensal"],
      ["Mês", "Receitas", "Despesas", "Resultado", "Taxa de economia", "Saldo no fim do mês"],
      ...r.history.map((h) => [capitalize(formatMonth(h.month)), formatBRL(h.income), formatBRL(h.expense), formatBRL(h.result), h.savingsRate == null ? "-" : formatPercent(h.savingsRate), formatBRL(h.balance)]),
      [],
      ["Despesas por categoria"],
      ["Categoria", "Total", "Participação", "Lançamentos"],
      ...r.categories.map((c) => [c.name, formatBRL(c.total), formatPercent(c.share), c.count]),
      [],
      ["Movimentações"],
      TRANSACTION_CSV_HEADER,
      ...transactionsToRows(r.txs, data),
    ];
    downloadFile(`${fileBase}.csv`, toCSV(rows), "text/csv;charset=utf-8");
    toast.success("Relatório CSV exportado.");
  }

  async function exportPDF() {
    setExporting(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const w = doc.internal.pageSize.getWidth();
      const s = r.summary;
      const green: [number, number, number] = [16, 185, 129];
      doc.setFillColor(10, 10, 11);
      doc.rect(0, 0, w, 74, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text("Relatório financeiro", 40, 38);
      doc.setFontSize(10);
      doc.setTextColor(180, 180, 186);
      doc.text(`${range.label} · gerado em ${formatDate(today)}`, 40, 56);

      let y = 100;
      const section = (title: string) => {
        doc.setTextColor(20, 20, 22);
        doc.setFontSize(12);
        doc.text(title, 40, y);
        y += 8;
      };
      const next = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        y = ((doc as any).lastAutoTable?.finalY ?? y) + 26;
      };
      const base = { margin: { left: 40, right: 40 }, styles: { fontSize: 9, cellPadding: 5 }, headStyles: { fillColor: [24, 24, 27] as [number, number, number] } };

      section("Resumo do período");
      autoTable(doc, {
        ...base,
        startY: y,
        head: [["Receitas", "Despesas", "Resultado", "Taxa de economia"]],
        body: [[formatBRL(s.income), formatBRL(s.expense), formatBRL(s.result), s.savingsRate == null ? "-" : formatPercent(s.savingsRate)]],
      });
      next();

      section("Comparativo entre meses");
      autoTable(doc, {
        ...base,
        startY: y,
        head: [["Mês", "Receitas", "Despesas", "Resultado", "Economia", "Saldo"]],
        body: r.history.map((h) => [capitalize(formatMonth(h.month)), formatBRL(h.income), formatBRL(h.expense), formatBRL(h.result), h.savingsRate == null ? "-" : formatPercent(h.savingsRate), formatBRL(h.balance)]),
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
      });
      next();

      if (r.categories.length) {
        section("Categorias com maiores despesas");
        autoTable(doc, {
          ...base,
          startY: y,
          head: [["Categoria", "Total", "Participação", "Lançamentos"]],
          body: r.categories.map((c) => [c.name, formatBRL(c.total), formatPercent(c.share), String(c.count)]),
          columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
        });
        next();
      }

      section(`Movimentações (${r.txs.length})`);
      const rows = transactionsToRows(r.txs, data);
      autoTable(doc, {
        ...base,
        startY: y,
        styles: { fontSize: 8, cellPadding: 4 },
        head: [["Data", "Tipo", "Descrição", "Categoria", "Forma", "Status", "Valor"]],
        body: rows.map((row) => [row[0], row[1], row[2], row[4], row[7], row[8], `${row[1] === "Despesa" ? "-" : ""}R$ ${row[3]}`]),
        columnStyles: { 6: { halign: "right" } },
        didParseCell: (hook) => {
          if (hook.section === "body" && hook.column.index === 6) hook.cell.styles.textColor = hook.row.raw && (hook.row.raw as string[])[1] === "Despesa" ? [220, 38, 38] : green;
        },
      });

      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(140, 140, 146);
        doc.text(`Página ${i} de ${pages}`, w - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
      }
      doc.save(`${fileBase}.pdf`);
      toast.success("Relatório PDF exportado.");
    } catch (e) {
      toast.error(`Não foi possível gerar o PDF: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  const s = r.summary;
  const maxCat = r.categories[0]?.total ?? 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Relatórios"
        description="Análises do período e exportação em CSV ou PDF."
        actions={
          <>
            <Button variant="outline" onClick={exportCSV}><FileSpreadsheet /> CSV</Button>
            <Button variant="outline" onClick={() => void exportPDF()} disabled={exporting}>{exporting ? <Loader2 className="animate-spin" /> : <FileDown />} PDF</Button>
          </>
        }
      />

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="month">Mensal</TabsTrigger>
            <TabsTrigger value="year">Anual</TabsTrigger>
            <TabsTrigger value="custom">Personalizado</TabsTrigger>
          </TabsList>
        </Tabs>
        {mode === "month" && <MonthSwitcher value={month} onChange={setMonth} />}
        {mode === "year" && (
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-32" aria-label="Ano"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {mode === "custom" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Input type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Data inicial" />
            <span className="text-muted-foreground">até</span>
            <Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Data final" />
          </div>
        )}
        <span className="ml-auto hidden text-sm text-muted-foreground md:block">{range.label}</span>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Receitas" icon={ArrowUpRight} tone="income" value={<Money value={s.income} tone="income" />} footer={`${r.txs.filter((t) => t.kind === "income").length} lançamentos`} />
        <StatCard label="Despesas" icon={ArrowDownRight} tone="expense" value={<Money value={s.expense} tone="expense" />} footer={`${r.txs.filter((t) => t.kind === "expense").length} lançamentos`} />
        <StatCard label="Resultado" icon={Scale} value={<Money value={s.result} tone="auto" sign />} />
        <StatCard label="Taxa de economia" icon={PiggyBank} tone="primary" value={<span className={cn("tabular", s.savingsRate != null && s.savingsRate < 0 && "text-expense")}>{s.savingsRate == null ? "—" : formatPercent(s.savingsRate)}</span>} footer="Resultado ÷ receitas" />
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Comparativo entre meses</CardTitle>
            <CardDescription>{mode === "month" ? "Últimos 6 meses até o mês selecionado" : "Meses do período"}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <HistoryChart data={r.history} height={260} />
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Mês</th>
                  <th className="py-2 text-right font-medium">Receitas</th>
                  <th className="py-2 text-right font-medium">Despesas</th>
                  <th className="py-2 text-right font-medium">Resultado</th>
                  <th className="py-2 text-right font-medium">Economia</th>
                  <th className="py-2 text-right font-medium">Var. despesas</th>
                </tr>
              </thead>
              <tbody>
                {r.history.map((h, i) => {
                  const change = i > 0 ? percentChange(h.expense, r.history[i - 1].expense) : null;
                  return (
                    <tr key={h.month} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5">{capitalize(formatMonth(h.month))}</td>
                      <td className="py-2.5 text-right"><Money value={h.income} tone="income" /></td>
                      <td className="py-2.5 text-right"><Money value={h.expense} tone="expense" /></td>
                      <td className="py-2.5 text-right font-medium"><Money value={h.result} tone="auto" /></td>
                      <td className="py-2.5 text-right tabular">{h.savingsRate == null ? "—" : formatPercent(h.savingsRate)}</td>
                      <td className={cn("py-2.5 text-right tabular", change != null && change > 0 ? "text-expense" : change != null && change < 0 ? "text-income" : "text-muted-foreground")}>
                        {change == null ? "—" : `${change > 0 ? "+" : ""}${formatPercent(change)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Evolução das receitas</CardTitle><CardDescription>Por mês</CardDescription></div></CardHeader>
          <CardContent><SeriesChart data={r.history} dataKey="income" label="Receitas" tone="income" /></CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Evolução das despesas</CardTitle><CardDescription>Por mês</CardDescription></div></CardHeader>
          <CardContent><SeriesChart data={r.history} dataKey="expense" label="Despesas" tone="expense" /></CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Categorias com maiores despesas</CardTitle><CardDescription>{range.label}</CardDescription></div></CardHeader>
          <CardContent>
            {r.categories.length === 0 ? (
              <EmptyState icon={ArrowDownRight} title="Sem despesas no período" className="py-8" />
            ) : (
              <ol className="grid gap-3">
                {r.categories.map((c, i) => (
                  <li key={c.categoryId ?? i} className="grid gap-1.5">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="w-4 text-xs text-muted-foreground tabular">{i + 1}</span>
                      <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground tabular">{formatPercent(c.share)}</span>
                      <Money value={c.total} className="w-28 text-right font-medium" />
                    </div>
                    <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${maxCat ? (c.total / maxCat) * 100 : 0}%`, backgroundColor: c.color }} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Receitas por categoria</CardTitle><CardDescription>{range.label}</CardDescription></div></CardHeader>
          <CardContent>
            {r.incomeCats.length === 0 ? (
              <EmptyState icon={ArrowUpRight} title="Sem receitas no período" className="py-8" />
            ) : (
              <ul className="grid gap-2.5">
                {r.incomeCats.map((c, i) => (
                  <li key={c.categoryId ?? i} className="flex items-center gap-3 text-sm">
                    <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground tabular">{formatPercent(c.share)}</span>
                    <Money value={c.total} tone="income" className="w-28 text-right font-medium" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold">Histórico de movimentações do período</h2>
        <TransactionsTable transactions={r.txs} emptyTitle="Nenhuma movimentação no período" />
      </section>
    </div>
  );
}
