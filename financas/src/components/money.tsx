"use client";

import { useCallback } from "react";
import { usePreferences } from "@/lib/store/preferences";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

export const HIDDEN = "R$ •••••";

/** Formatação que respeita a opção "ocultar valores". */
export function useMoneyFormat() {
  const { hideValues } = usePreferences();
  const fmt = useCallback((v: number) => (hideValues ? HIDDEN : formatBRL(v)), [hideValues]);
  const compact = useCallback((v: number) => (hideValues ? "•••" : formatBRLCompact(v)), [hideValues]);
  return { fmt, compact, hidden: hideValues };
}

type Tone = "neutral" | "income" | "expense" | "auto";

export function Money({
  value,
  tone = "neutral",
  sign = false,
  className,
}: {
  value: number;
  tone?: Tone;
  /** Mostra "+" para valores positivos. */
  sign?: boolean;
  className?: string;
}) {
  const { fmt, hidden } = useMoneyFormat();
  const resolved = tone === "auto" ? (value < 0 ? "expense" : value > 0 ? "income" : "neutral") : tone;
  const text = fmt(value);
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        resolved === "income" && "text-income",
        resolved === "expense" && "text-expense",
        className,
      )}
    >
      {sign && !hidden && value > 0 ? "+" : ""}
      {text}
    </span>
  );
}
