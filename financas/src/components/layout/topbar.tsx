"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Eye, EyeOff, LogOut, Menu, Minus, Moon, Plus, Search, Settings, Sun, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { SidebarNav } from "./sidebar";
import { Logo } from "./logo";
import { CommandPalette } from "./command-palette";
import { NotificationsButton } from "./notifications";
import { usePreferences } from "@/lib/store/preferences";
import { useFinance } from "@/lib/store/finance-store";
import { useTransactionActions } from "@/components/transactions/quick-add";
import { getSupabase } from "@/lib/supabase/client";
import { hardNavigate } from "@/lib/navigation";

export function Topbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { hideValues, toggleHideValues } = usePreferences();
  const { resolvedTheme, setTheme } = useTheme();
  const { user, data } = useFinance();
  const { open } = useTransactionActions();
  const name = data.profile?.full_name || user?.email?.split("@")[0] || "Você";

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-xl sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
        <Menu />
      </Button>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent>
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex h-16 items-center px-5">
            <Logo />
          </div>
          <SidebarNav onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-card/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:max-w-sm"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Buscar movimentações…</span>
        <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />

      <div className="ml-auto flex items-center gap-1">
        <Tooltip content={hideValues ? "Mostrar valores" : "Ocultar valores"} side="bottom">
          <Button variant="ghost" size="icon" onClick={toggleHideValues} aria-label={hideValues ? "Mostrar valores" : "Ocultar valores"} aria-pressed={hideValues}>
            {hideValues ? <EyeOff /> : <Eye />}
          </Button>
        </Tooltip>
        <NotificationsButton />
        <Tooltip content="Alternar tema" side="bottom">
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Alternar tema">
            <Sun className="hidden dark:block" />
            <Moon className="dark:hidden" />
          </Button>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="ml-1" aria-label="Novo lançamento">
              <Plus />
              <span className="hidden sm:inline">Novo</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => open({ kind: "income" })}>
              <Plus className="!text-income" /> Nova receita
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => open({ kind: "expense" })}>
              <Minus className="!text-expense" /> Nova despesa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="ml-1 rounded-full" aria-label="Conta do usuário">
              <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">{name.slice(0, 2)}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium text-foreground">{name}</p>
              <p className="truncate text-xs">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/configuracoes"><Settings /> Configurações</Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="sm:hidden" onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              <User /> Tema {resolvedTheme === "dark" ? "claro" : "escuro"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={async () => { await getSupabase().auth.signOut(); hardNavigate("/login"); }}>
              <LogOut /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
