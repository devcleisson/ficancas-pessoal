import { cn } from "@/lib/utils";

/** Barra de progresso; `value` entre 0 e 1 (valores acima de 1 preenchem a barra). */
function Progress({ value, className, indicatorClassName, color }: { value: number; className?: string; indicatorClassName?: string; color?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn("h-full rounded-full bg-primary transition-[width] duration-700 ease-out", indicatorClassName)}
        style={{ width: `${pct}%`, ...(color ? { backgroundColor: color } : {}) }}
      />
    </div>
  );
}

export { Progress };
