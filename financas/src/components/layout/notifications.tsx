"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, BellOff, Info, OctagonAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFinance } from "@/lib/store/finance-store";
import { buildNotifications } from "@/lib/finance";
import { todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICON = { danger: OctagonAlert, warning: AlertTriangle, info: Info };
const TONE = { danger: "text-expense bg-expense/10", warning: "text-warning bg-warning/10", info: "text-sky-500 bg-sky-500/10" };

export function useNotifications() {
  const { data } = useFinance();
  return useMemo(() => buildNotifications(data, todayISO()), [data]);
}

export function NotificationsButton() {
  const items = useNotifications();
  const [open, setOpen] = useState(false);
  const urgent = items.filter((i) => i.level !== "info").length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notificações (${items.length})`}>
          <Bell />
          {items.length > 0 && (
            <span className={cn("absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold text-white", urgent ? "bg-expense" : "bg-sky-500")}>
              {items.length > 9 ? "9+" : items.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,380px)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notificações</p>
          <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? "aviso" : "avisos"}</span>
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
            <BellOff className="size-5" />
            Tudo em dia. Nenhuma conta vencendo nos próximos dias.
          </div>
        ) : (
          <ul className="max-h-[60dvh] divide-y divide-border overflow-y-auto">
            {items.map((n) => {
              const Icon = ICON[n.level];
              return (
                <li key={n.id}>
                  <Link href={n.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
                    <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg", TONE[n.level])}>
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{n.title}</span>
                      <span className="block text-xs text-muted-foreground">{n.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
