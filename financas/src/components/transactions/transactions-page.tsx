"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock, FileUp, Plus, Repeat, Scale, Shuffle, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { useFinance } from "@/lib/store/finance-store";
import { useTransactionActions } from "./quick-add";
import { TransactionFilters, TransactionsTable, defaultFilters, filterTransactions, type TxFilters } from "./transactions-list";
import { PERIOD_LABEL } from "./period";
import { sumMoney } from "@/lib/format";
import type { Kind } from "@/lib/types";

const COPY = {
  income: { title: "Receitas", description: "Todas as suas fontes de renda.", button: "Nova receita" },
  expense: { title: "Despesas", description: "Registre, pesquise e filtre seus gastos.", button: "Nova despesa" },
  all: { title: "Movimentações", description: "Histórico completo de receitas e despesas.", button: "Novo lançamento" },
};

export function TransactionsPage({ kind }: { kind?: Kind }) {
  const params = useSearchParams();
  const { data } = useFinance();
  const { open } = useTransactionActions();
  const initialStatus = params.get("status");
  const uncategorizedParam = params.get("categoria") === "sem";
  const [filters, setFilters] = useState<TxFilters>(() =>
    defaultFilters({
      kind: kind ?? "all",
      status: initialStatus === "pending" || initialStatus === "paid" ? initialStatus : "all",
      preset: initialStatus === "pending" || uncategorizedParam ? "all" : "this_month",
      categoryId: uncategorizedParam ? "none" : "all",
    }),
  );
  const uncategorized = data.transactions.filter((t) => !t.category_id && (!kind || t.kind === kind)).length;

  const rows = useMemo(() => filterTransactions(data.transactions, filters), [data.transactions, filters]);
  const copy = COPY[kind ?? "all"];

  const stats = useMemo(() => {
    const sum = (f: (t: (typeof rows)[number]) => boolean) => sumMoney(rows.filter(f).map((t) => t.amount));
    return {
      total: sum(() => true),
      done: sum((t) => t.status === "paid" || !!t.card_id),
      pending: sum((t) => t.status === "pending" && !t.card_id),
      fixed: sum((t) => t.expense_type === "fixed"),
      variable: sum((t) => t.expense_type !== "fixed"),
      income: sum((t) => t.kind === "income"),
      expense: sum((t) => t.kind === "expense"),
    };
  }, [rows]);

  const periodLabel = PERIOD_LABEL[filters.preset].toLowerCase();

  return (
    <div className="grid gap-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/importar"><FileUp /> Importar extrato</Link>
            </Button>
            {kind ? (
              <Button onClick={() => open({ kind })}>
                <Plus /> {copy.button}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => open({ kind: "income" })}><Plus /> Receita</Button>
                <Button onClick={() => open({ kind: "expense" })}><Plus /> Despesa</Button>
              </>
            )}
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kind === "income" && (
          <>
            <StatCard label="Total de receitas" icon={ArrowUpRight} tone="income" value={<Money value={stats.total} tone="income" />} footer={`Filtro: ${periodLabel}`} />
            <StatCard label="Recebido" icon={CheckCircle2} tone="primary" value={<Money value={stats.done} />} />
            <StatCard label="A receber" icon={Clock} tone="warning" value={<Money value={stats.pending} />} />
            <StatCard label="Lançamentos" icon={Scale} value={<span className="tabular">{rows.length}</span>} footer="Que atendem aos filtros" />
          </>
        )}
        {kind === "expense" && (
          <>
            <StatCard label="Total de despesas" icon={ArrowDownRight} tone="expense" value={<Money value={stats.total} tone="expense" />} footer={`Filtro: ${periodLabel}`} />
            <StatCard label="Pendentes" icon={Clock} tone="warning" value={<Money value={stats.pending} />} footer="Ainda não pagas" />
            <StatCard label="Fixas" icon={Repeat} value={<Money value={stats.fixed} />} />
            <StatCard label="Variáveis" icon={Shuffle} value={<Money value={stats.variable} />} />
          </>
        )}
        {!kind && (
          <>
            <StatCard label="Receitas" icon={ArrowUpRight} tone="income" value={<Money value={stats.income} tone="income" />} footer={`Filtro: ${periodLabel}`} />
            <StatCard label="Despesas" icon={ArrowDownRight} tone="expense" value={<Money value={stats.expense} tone="expense" />} />
            <StatCard label="Resultado" icon={Scale} value={<Money value={stats.income - stats.expense} tone="auto" sign />} />
            <StatCard label="Pendentes" icon={Clock} tone="warning" value={<Money value={stats.pending} />} footer="A pagar ou a receber" />
          </>
        )}
      </section>

      {uncategorized > 0 && filters.categoryId !== "none" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning/[0.07] px-4 py-3 text-sm">
          <Tags className="size-4 shrink-0 text-warning" />
          <span className="flex-1">
            Você tem <b>{uncategorized}</b> lançamento(s) sem categoria. Selecione vários e defina a categoria de uma vez.
          </span>
          <Button size="sm" variant="outline" className="bg-card" onClick={() => setFilters({ ...filters, categoryId: "none", preset: "all" })}>
            Ver e categorizar
          </Button>
        </div>
      )}

      <TransactionFilters filters={filters} onChange={setFilters} showKind={!kind} kind={kind} />
      <TransactionsTable
        transactions={rows}
        emptyAction={
          <Button variant="outline" size="sm" onClick={() => open({ kind: kind ?? "expense" })}>
            <Plus /> {copy.button}
          </Button>
        }
      />
    </div>
  );
}
