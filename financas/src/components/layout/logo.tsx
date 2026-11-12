import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="9" className="fill-foreground" />
        <path d="M9 21.5 14 16l3.5 3.5L23 12" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="stroke-primary" />
        <circle cx="23" cy="12" r="2" className="fill-primary" />
      </svg>
      {!compact && (
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-tight">Finanças</p>
          <p className="text-[11px] text-muted-foreground">Controle pessoal</p>
        </div>
      )}
    </div>
  );
}
