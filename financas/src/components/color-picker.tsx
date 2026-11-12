"use client";

import { Check } from "lucide-react";
import { COLOR_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_OPTIONS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Cor ${c}`}
          aria-pressed={value === c}
          className={cn("flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110", value === c && "ring-2 ring-foreground/60")}
          style={{ backgroundColor: c }}
        >
          {value === c && <Check className="size-3.5 text-white" />}
        </button>
      ))}
    </div>
  );
}
