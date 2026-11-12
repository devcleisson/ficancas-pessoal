"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { moneyInputValue, parseMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Campo de valor em reais. Aceita "1.234,56" ou "1234.56" e devolve número
 * (ou null quando vazio/ inválido).
 */
export function MoneyInput({
  value,
  onChange,
  id,
  invalid,
  placeholder = "0,00",
  allowNegative = false,
  autoFocus,
  className,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  id?: string;
  invalid?: boolean;
  placeholder?: string;
  allowNegative?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(() => moneyInputValue(value));
  const [lastValue, setLastValue] = useState(value);

  // Sincroniza quando o valor muda por fora (ex.: edição de outro registro).
  if (value !== lastValue) {
    setLastValue(value);
    if (parseMoney(text) !== value) setText(moneyInputValue(value));
  }

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        className="pl-9 tabular"
        value={text}
        onChange={(e) => {
          const raw = allowNegative ? e.target.value.replace(/[^\d.,-]/g, "") : e.target.value.replace(/[^\d.,]/g, "");
          setText(raw);
          const parsed = parseMoney(raw);
          setLastValue(parsed);
          onChange(parsed);
        }}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          const parsed = parseMoney(text);
          if (parsed != null) setText(moneyInputValue(parsed));
        }}
      />
    </div>
  );
}
