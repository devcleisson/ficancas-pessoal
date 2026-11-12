import type { ISODate } from "./types";

// ---------------------------------------------------------------------------
// Dinheiro — toda soma é feita em centavos para evitar erros de ponto flutuante.
// ---------------------------------------------------------------------------

export const toCents = (v: number) => Math.round(v * 100);
export const fromCents = (c: number) => c / 100;
export const sumMoney = (values: number[]) => fromCents(values.reduce((s, v) => s + toCents(v), 0));
export const roundMoney = (v: number) => fromCents(toCents(v));

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const num = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

/** "R$ 1.234,56" (o Intl usa espaço não separável; normalizamos para espaço comum). */
export const formatBRL = (v: number) => brl.format(Object.is(v, -0) ? 0 : v).replace(/ /g, " ");
export const formatBRLCompact = (v: number) => brlCompact.format(v).replace(/ /g, " ");
export const formatNumber = (v: number) => num.format(v);
export const formatPercent = (ratio: number) => pct.format(Number.isFinite(ratio) ? ratio : 0);

/**
 * Converte o texto digitado pelo usuário em número.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 10", "10".
 * Retorna null quando o texto não é um valor válido.
 */
export function parseMoney(input: string): number | null {
  if (typeof input !== "string") return null;
  let s = input.replace(/R\$|\s/g, "").trim();
  if (!s) return null;
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // O separador que aparece por último é o decimal.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    if ((s.match(/,/g) ?? []).length > 1) return null;
    s = s.replace(",", ".");
  } else if (lastDot > -1) {
    const parts = s.split(".");
    // "1.234" ou "1.234.567" → milhar; "12.5" → decimal.
    const isThousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3);
    s = isThousands ? parts.join("") : s;
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const decimals = s.split(".")[1];
  if (decimals && decimals.length > 2) return null;
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** Formata um número para exibir dentro de um campo de valor ("1.234,56"). */
export const moneyInputValue = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? "" : formatNumber(v);

// ---------------------------------------------------------------------------
// Datas — trabalhamos com strings YYYY-MM-DD para não sofrer com fuso horário.
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isValidISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (y < 1900 || y > 2200) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export const todayISO = () => toISODate(new Date());

export const daysInMonth = (year: number, month1: number) => new Date(year, month1, 0).getDate();

/** Soma meses mantendo o dia (limitado ao último dia do mês de destino). */
export function addMonths(date: ISODate, months: number, anchorDay?: number): ISODate {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(anchorDay ?? d, daysInMonth(ny, nm));
  return `${ny}-${pad(nm)}-${pad(day)}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISODate(date);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  const ms = parseISODate(a).getTime() - parseISODate(b).getTime();
  return Math.round(ms / 86_400_000);
}

/** "2026-03" a partir de uma data. */
export const monthKey = (date: ISODate) => date.slice(0, 7);
export const monthStart = (key: string): ISODate => `${key}-01`;
export function monthEnd(key: string): ISODate {
  const [y, m] = key.split("-").map(Number);
  return `${key}-${pad(daysInMonth(y, m))}`;
}
export const shiftMonth = (key: string, n: number) => monthKey(addMonths(monthStart(key), n));

/** Lista de chaves de mês de `from` até `to`, inclusive. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let k = from;
  for (let i = 0; k <= to && i < 600; i++) {
    out.push(k);
    k = shiftMonth(k, 1);
  }
  return out;
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export const weekdayShort = (i: number) => WEEKDAYS_SHORT[i];

/** "12/11/2026" */
export function formatDate(date: ISODate | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** "12 nov" */
export function formatDateShort(date: ISODate): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "novembro de 2026" */
export function formatMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

/** "nov/26" */
export function formatMonthShort(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`;
}

/** "Hoje", "Amanhã", "em 3 dias", "há 2 dias" */
export function relativeDay(date: ISODate, today = todayISO()): string {
  const diff = diffDays(date, today);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  if (diff > 1) return `em ${diff} dias`;
  return `há ${-diff} dias`;
}

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
