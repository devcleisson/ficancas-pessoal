"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { capitalize, formatMonth, monthKey, shiftMonth, todayISO } from "@/lib/format";

export function MonthSwitcher({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  const current = monthKey(todayISO());
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
      <Button variant="ghost" size="icon-sm" onClick={() => onChange(shiftMonth(value, -1))} aria-label="Mês anterior">
        <ChevronLeft />
      </Button>
      <button
        type="button"
        onClick={() => onChange(current)}
        className="min-w-36 px-1 text-center text-sm font-medium"
        title="Voltar para o mês atual"
      >
        {capitalize(formatMonth(value))}
      </button>
      <Button variant="ghost" size="icon-sm" onClick={() => onChange(shiftMonth(value, 1))} aria-label="Próximo mês">
        <ChevronRight />
      </Button>
    </div>
  );
}
