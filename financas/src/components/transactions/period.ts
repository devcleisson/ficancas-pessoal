import { addMonths, monthEnd, monthKey, shiftMonth, todayISO } from "@/lib/format";

export type PeriodPreset = "this_month" | "last_month" | "last_3" | "last_6" | "this_year" | "last_12" | "all" | "custom";

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  this_month: "Este mês",
  last_month: "Mês passado",
  last_3: "Últimos 3 meses",
  last_6: "Últimos 6 meses",
  this_year: "Este ano",
  last_12: "Últimos 12 meses",
  all: "Todo o período",
  custom: "Personalizado",
};

/** Converte um período em intervalo de datas [from, to]. */
export function resolvePeriod(preset: PeriodPreset, custom: { from: string; to: string }, today = todayISO()) {
  const cur = monthKey(today);
  switch (preset) {
    case "this_month":
      return { from: `${cur}-01`, to: monthEnd(cur) };
    case "last_month": {
      const k = shiftMonth(cur, -1);
      return { from: `${k}-01`, to: monthEnd(k) };
    }
    case "last_3":
      return { from: `${shiftMonth(cur, -2)}-01`, to: monthEnd(cur) };
    case "last_6":
      return { from: `${shiftMonth(cur, -5)}-01`, to: monthEnd(cur) };
    case "last_12":
      return { from: `${shiftMonth(cur, -11)}-01`, to: monthEnd(cur) };
    case "this_year":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case "all":
      return { from: "1900-01-01", to: "2200-12-31" };
    case "custom":
      return {
        from: custom.from || addMonths(today, -1),
        to: custom.to || today,
      };
  }
}
