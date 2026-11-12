"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { TransactionDialog } from "./transaction-dialog";
import { useFinance } from "@/lib/store/finance-store";
import { useConfirm } from "@/components/confirm";
import type { Kind, Transaction } from "@/lib/types";

interface OpenOptions {
  kind: Kind;
  editing?: Transaction | null;
  defaults?: Partial<Transaction>;
}

interface TransactionActions {
  open: (o: OpenOptions) => void;
  edit: (t: Transaction) => void;
  remove: (t: Transaction) => Promise<void>;
  togglePaid: (t: Transaction) => Promise<void>;
}

const Ctx = createContext<TransactionActions | null>(null);

/** Um único formulário de lançamento compartilhado por todas as telas. */
export function TransactionActionsProvider({ children }: { children: ReactNode }) {
  const { remove: removeRow, removeWhere, update } = useFinance();
  const confirm = useConfirm();
  const [state, setState] = useState<OpenOptions & { open: boolean }>({ kind: "expense", open: false });

  const open = useCallback((o: OpenOptions) => setState({ ...o, open: true }), []);
  const edit = useCallback((t: Transaction) => setState({ kind: t.kind, editing: t, open: true }), []);

  const remove = useCallback(
    async (t: Transaction) => {
      try {
        if (t.installment_group) {
          const all = await confirm({
            title: "Excluir compra parcelada?",
            description: `Esta é a parcela ${t.installment_number}/${t.installment_total} de "${t.description}". Todas as parcelas da compra serão excluídas.`,
            confirmText: "Excluir todas as parcelas",
          });
          if (!all) return;
          await removeWhere("transactions", "installment_group", t.installment_group);
          toast.success("Compra parcelada excluída.");
          return;
        }
        const ok = await confirm({
          title: t.kind === "income" ? "Excluir receita?" : "Excluir despesa?",
          description: `"${t.description}" será excluído permanentemente.`,
        });
        if (!ok) return;
        await removeRow("transactions", t.id);
        toast.success("Lançamento excluído.");
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [confirm, removeRow, removeWhere],
  );

  const togglePaid = useCallback(
    async (t: Transaction) => {
      if (t.card_id) return;
      if (t.status === "pending" && !t.account_id) {
        toast.message("Escolha a conta para marcar como pago.");
        edit({ ...t, status: "paid" });
        return;
      }
      try {
        await update("transactions", t.id, { status: t.status === "paid" ? "pending" : "paid" });
        toast.success(t.status === "paid" ? "Marcado como pendente." : t.kind === "income" ? "Marcado como recebido." : "Marcado como pago.");
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [update, edit],
  );

  const value = useMemo(() => ({ open, edit, remove, togglePaid }), [open, edit, remove, togglePaid]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <TransactionDialog
        open={state.open}
        onOpenChange={(o) => setState((s) => ({ ...s, open: o }))}
        kind={state.kind}
        editing={state.editing}
        defaults={state.defaults}
      />
    </Ctx.Provider>
  );
}

export function useTransactionActions() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTransactionActions precisa estar dentro de <TransactionActionsProvider>");
  return ctx;
}
