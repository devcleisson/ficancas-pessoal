"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CategoryIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { useFinance } from "@/lib/store/finance-store";
import { useTransactionActions } from "@/components/transactions/quick-add";
import { ALL_NAV } from "./nav";
import { formatDate } from "@/lib/format";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca global (Ctrl/⌘ + K): navegação, ações e movimentações. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { data } = useFinance();
  const { open: openTx, edit } = useTransactionActions();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const catById = new Map(data.categories.map((c) => [c.id, c]));
  const q = norm(query.trim());

  const nav = ALL_NAV.filter((n) => !q || norm(n.label).includes(q));
  const actions = [
    { id: "new-income", label: "Nova receita", icon: Plus, run: () => openTx({ kind: "income" }) },
    { id: "new-expense", label: "Nova despesa", icon: Minus, run: () => openTx({ kind: "expense" }) },
  ].filter((a) => !q || norm(a.label).includes(q));

  const results = !q
    ? []
    : data.transactions
      .filter((t) => {
        const cat = t.category_id ? catById.get(t.category_id)?.name ?? "" : "";
        return norm(`${t.description} ${t.notes ?? ""} ${t.source ?? ""} ${cat} ${t.amount.toFixed(2).replace(".", ",")}`).includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);

  const close = () => {
    onOpenChange(false);
    setQuery("");
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed top-[12dvh] left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <DialogPrimitive.Title className="sr-only">Busca global</DialogPrimitive.Title>
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Buscar movimentações, páginas ou ações…" />
            <CommandList>
              <CommandEmpty>Nada encontrado para “{query}”.</CommandEmpty>
              {results.length > 0 && (
                <CommandGroup heading={`Movimentações (${results.length}${results.length === 30 ? "+" : ""})`}>
                  {results.map((t) => {
                    const cat = t.category_id ? catById.get(t.category_id) : undefined;
                    return (
                      <CommandItem key={t.id} value={t.id} onSelect={() => { close(); edit(t); }}>
                        <CategoryIcon icon={cat?.icon ?? "circle"} color={cat?.color ?? "#71717a"} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{t.description}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(t.date)} · {cat?.name ?? "Sem categoria"}</p>
                        </div>
                        <Money value={t.kind === "income" ? t.amount : -t.amount} tone={t.kind === "income" ? "income" : "expense"} className="text-xs" />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              {actions.length > 0 && (
                <CommandGroup heading="Ações">
                  {actions.map((a) => (
                    <CommandItem key={a.id} value={a.id} onSelect={() => { close(); a.run(); }}>
                      <a.icon /> {a.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {nav.length > 0 && (
                <CommandGroup heading="Ir para">
                  {nav.map((n) => (
                    <CommandItem key={n.href} value={n.href} onSelect={() => { close(); router.push(n.href); }}>
                      <n.icon /> {n.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
