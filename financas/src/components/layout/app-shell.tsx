"use client";

import type { ReactNode } from "react";
import { AlertCircle, RotateCw } from "lucide-react";
import { FinanceProvider, useFinance } from "@/lib/store/finance-store";
import { PreferencesProvider } from "@/lib/store/preferences";
import { ConfirmProvider } from "@/components/confirm";
import { TransactionActionsProvider } from "@/components/transactions/quick-add";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider>
      <FinanceProvider>
        <TooltipProvider delayDuration={300}>
          <ConfirmProvider>
            <TransactionActionsProvider>
              <Sidebar />
              <div className="lg:pl-64">
                <Topbar />
                <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                  <Gate>{children}</Gate>
                </main>
              </div>
            </TransactionActionsProvider>
          </ConfirmProvider>
        </TooltipProvider>
      </FinanceProvider>
    </PreferencesProvider>
  );
}

/** Mostra esqueleto enquanto carrega e erro com opção de tentar novamente. */
function Gate({ children }: { children: ReactNode }) {
  const { status, error, reload } = useFinance();
  if (status === "loading") {
    return (
      <div className="grid gap-6" aria-busy="true" aria-label="Carregando">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 text-center">
        <AlertCircle className="size-8 text-expense" />
        <div>
          <p className="font-medium">Não foi possível carregar seus dados</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
        <Button onClick={() => void reload()}>
          <RotateCw /> Tentar novamente
        </Button>
      </div>
    );
  }
  return <div className="animate-rise">{children}</div>;
}
