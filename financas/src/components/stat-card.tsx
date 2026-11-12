import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  footer,
  className,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: "neutral" | "income" | "expense" | "primary" | "warning";
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("relative overflow-hidden p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg [&_svg]:size-4",
            tone === "neutral" && "bg-muted text-muted-foreground",
            tone === "income" && "bg-income/12 text-income",
            tone === "expense" && "bg-expense/12 text-expense",
            tone === "primary" && "bg-primary/12 text-primary",
            tone === "warning" && "bg-warning/12 text-warning",
          )}
        >
          <Icon />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      {footer && <div className="mt-2 text-xs text-muted-foreground">{footer}</div>}
    </Card>
  );
}

/** Indicador de variação: ▲ 12,5% / ▼ 3,1% */
export function Delta({ ratio, invert = false, suffix = "vs. mês anterior" }: { ratio: number | null; invert?: boolean; suffix?: string }) {
  if (ratio == null) return <span>Sem base de comparação</span>;
  const up = ratio > 0;
  const good = invert ? !up : up;
  const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(Math.abs(ratio));
  if (ratio === 0) return <span>Igual ao mês anterior</span>;
  return (
    <span>
      <span className={cn("font-medium", good ? "text-income" : "text-expense")}>
        {up ? "▲" : "▼"} {pct}
      </span>{" "}
      {suffix}
    </span>
  );
}
