"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useMoneyFormat } from "@/components/money";
import { formatMonth, formatMonthShort, formatPercent, capitalize } from "@/lib/format";
import type { CategoryTotal, MonthPoint } from "@/lib/finance";

const PALETTE = {
  dark: { income: "#34d399", expense: "#f87171", balance: "#34d399", result: "#e4e4e7", grid: "#1d1d22", axis: "#71717a", cursor: "rgba(255,255,255,0.04)" },
  light: { income: "#059669", expense: "#dc2626", balance: "#059669", result: "#18181b", grid: "#ececef", axis: "#8b8b94", cursor: "rgba(0,0,0,0.04)" },
};

function useChartColors() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  return PALETTE[mounted && resolvedTheme === "light" ? "light" : "dark"];
}

interface TooltipRow {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

function ChartTooltip({ active, payload, label, labels }: { active?: boolean; payload?: TooltipRow[]; label?: string | number; labels: Record<string, string> }) {
  const { fmt } = useMoneyFormat();
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-44 rounded-xl border border-border bg-popover/95 px-3 py-2.5 text-xs shadow-xl backdrop-blur">
      {label != null && <p className="mb-1.5 font-medium text-foreground">{capitalize(formatMonth(String(label)))}</p>}
      <div className="grid gap-1">
        {payload.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
              {labels[String(p.dataKey)] ?? p.name}
            </span>
            <span className="font-medium text-foreground tabular">{fmt(Number(p.value))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function useAxis() {
  const c = useChartColors();
  const { compact } = useMoneyFormat();
  return {
    c,
    xAxis: <XAxis dataKey="month" tickFormatter={(m: string) => formatMonthShort(m)} tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} dy={6} />,
    yAxis: <YAxis domain={[(min: number) => Math.min(0, min), (max: number) => (max <= 0 ? 1000 : max)]} tickFormatter={(v: number) => compact(v)} tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={78} />,
    grid: <CartesianGrid vertical={false} stroke={c.grid} />,
  };
}

/** Barras de receitas x despesas por mês. */
export function IncomeExpenseChart({ data, height = 280 }: { data: MonthPoint[]; height?: number }) {
  const { c, xAxis, yAxis, grid } = useAxis();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barGap={4} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        {grid}
        {xAxis}
        {yAxis}
        <Tooltip cursor={{ fill: c.cursor }} content={<ChartTooltip labels={{ income: "Receitas", expense: "Despesas" }} />} />
        <Bar dataKey="income" fill={c.income} radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={700} />
        <Bar dataKey="expense" fill={c.expense} radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={700} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Área com a evolução do saldo total no fim de cada mês. */
export function BalanceChart({ data, height = 280 }: { data: MonthPoint[]; height?: number }) {
  const { c, xAxis, yAxis, grid } = useAxis();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.balance} stopOpacity={0.35} />
            <stop offset="100%" stopColor={c.balance} stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid}
        {xAxis}
        {yAxis}
        <ReferenceLine y={0} stroke={c.axis} strokeOpacity={0.4} />
        <Tooltip cursor={{ stroke: c.axis, strokeDasharray: 3 }} content={<ChartTooltip labels={{ balance: "Saldo" }} />} />
        <Area type="monotone" dataKey="balance" stroke={c.balance} strokeWidth={2} fill="url(#balanceFill)" animationDuration={800} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Receitas, despesas e resultado mensal (12 meses). */
export function HistoryChart({ data, height = 300 }: { data: MonthPoint[]; height?: number }) {
  const { c, xAxis, yAxis, grid } = useAxis();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        {grid}
        {xAxis}
        {yAxis}
        <ReferenceLine y={0} stroke={c.axis} strokeOpacity={0.4} />
        <Tooltip cursor={{ fill: c.cursor }} content={<ChartTooltip labels={{ income: "Receitas", expense: "Despesas", result: "Resultado" }} />} />
        <Bar dataKey="income" fill={c.income} fillOpacity={0.85} radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="expense" fill={c.expense} fillOpacity={0.85} radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Line type="monotone" dataKey="result" stroke={c.result} strokeWidth={2} dot={{ r: 2.5, fill: c.result }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Uma série simples (ex.: evolução das receitas). */
export function SeriesChart({ data, dataKey, label, tone, height = 220 }: { data: MonthPoint[]; dataKey: "income" | "expense"; label: string; tone: "income" | "expense"; height?: number }) {
  const { c, xAxis, yAxis, grid } = useAxis();
  const color = c[tone];
  const id = `fill-${dataKey}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid}
        {xAxis}
        {yAxis}
        <Tooltip cursor={{ stroke: c.axis, strokeDasharray: 3 }} content={<ChartTooltip labels={{ [dataKey]: label }} />} />
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${id})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Rosca de gastos por categoria com legenda. */
export function CategoryDonut({ items, total, height = 220 }: { items: CategoryTotal[]; total: number; height?: number }) {
  const { fmt } = useMoneyFormat();
  const [active, setActive] = useState<number | null>(null);
  const top = items.slice(0, 7);
  const rest = items.slice(7);
  const slices = rest.length
    ? [...top, { categoryId: "__rest__", name: "Outras", color: "#52525b", icon: "circle", total: rest.reduce((s, r) => s + r.total, 0), share: rest.reduce((s, r) => s + r.share, 0), count: 0 }]
    : top;
  const focus = active != null ? slices[active] : null;

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[180px_minmax(0,1fr)]">
      <div className="relative mx-auto aspect-square w-full max-w-[180px]">
        <ResponsiveContainer width="100%" height={height > 180 ? 180 : height}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="total"
              nameKey="name"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={slices.length > 1 ? 2 : 0}
              cornerRadius={4}
              stroke="none"
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
              animationDuration={700}
            >
              {slices.map((s, i) => (
                <Cell key={s.categoryId ?? i} fill={s.color} fillOpacity={active == null || active === i ? 1 : 0.35} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] text-muted-foreground">{focus ? focus.name : "Total"}</span>
          <span className="text-sm font-semibold tabular">{fmt(focus ? focus.total : total)}</span>
          {focus && <span className="text-[11px] text-muted-foreground">{formatPercent(focus.share)}</span>}
        </div>
      </div>
      <ul className="grid min-w-0 gap-2">
        {slices.map((s, i) => (
          <li key={s.categoryId ?? i} className="flex items-center gap-2 text-sm" onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.name}</span>
            <span className="text-xs text-muted-foreground tabular">{formatPercent(s.share)}</span>
            <span className="shrink-0 text-right font-medium tabular">{fmt(s.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
