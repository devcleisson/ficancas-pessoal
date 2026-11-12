"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import type { FinanceData, Profile, TableName } from "@/lib/types";
import { hardNavigate } from "@/lib/navigation";

/** Tabela do banco → chave no estado local. */
const TABLE_KEY = {
  categories: "categories",
  accounts: "accounts",
  credit_cards: "cards",
  transactions: "transactions",
  transfers: "transfers",
  card_payments: "cardPayments",
  budgets: "budgets",
  recurring_bills: "bills",
  goals: "goals",
  goal_contributions: "contributions",
} as const satisfies Record<TableName, keyof FinanceData>;

type Key<T extends TableName> = (typeof TABLE_KEY)[T];
export type RowOf<T extends TableName> = FinanceData[Key<T>][number];

const NUMERIC_FIELDS = ["amount", "initial_balance", "limit_amount", "target_amount"];
const INT_FIELDS = ["closing_day", "due_day", "anchor_day", "installment_number", "installment_total"];

/** O PostgREST pode devolver `numeric` como string; normalizamos para number. */
function normalize<T>(row: T): T {
  const r = { ...(row as Record<string, unknown>) };
  for (const f of NUMERIC_FIELDS) if (f in r && r[f] != null) r[f] = Number(r[f]);
  for (const f of INT_FIELDS) if (f in r && r[f] != null) r[f] = Number(r[f]);
  return r as T;
}

const EMPTY: FinanceData = {
  profile: null,
  categories: [],
  accounts: [],
  cards: [],
  transactions: [],
  transfers: [],
  cardPayments: [],
  budgets: [],
  bills: [],
  goals: [],
  contributions: [],
};

const PAGE = 1000;

async function fetchAll(sb: SupabaseClient, table: TableName) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select("*").order("created_at", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []).map(normalize));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/** Traduz erros do Postgres/Supabase para mensagens claras em português. */
export function friendlyError(err: unknown): string {
  const e = err as { code?: string; message?: string; details?: string } | null;
  const msg = e?.message ?? String(err);
  switch (e?.code) {
    case "23503":
      return "Este registro está sendo usado por outros lançamentos e não pode ser excluído. Altere ou exclua esses lançamentos primeiro.";
    case "23505":
      return "Já existe um registro com esse nome.";
    case "23514":
      if (msg.includes("paid_needs_account")) return "Escolha uma conta para lançamentos já pagos ou recebidos.";
      if (msg.includes("card_purchase_shape")) return "Compras no cartão não podem debitar uma conta.";
      return "Algum valor informado é inválido. Revise os campos.";
    case "42501":
      return "Você não tem permissão para esta operação. Entre novamente.";
    case "PGRST301":
    case "PGRST303":
      return "Sua sessão expirou. Entre novamente.";
  }
  if (/fetch|network|Failed to fetch/i.test(msg)) return "Não foi possível conectar ao servidor. Verifique sua internet.";
  return msg || "Ocorreu um erro inesperado.";
}

interface FinanceContextValue {
  data: FinanceData;
  user: User | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  reload: () => Promise<void>;
  insert: <T extends TableName>(table: T, values: Partial<RowOf<T>>) => Promise<RowOf<T>>;
  insertMany: <T extends TableName>(table: T, values: Partial<RowOf<T>>[]) => Promise<RowOf<T>[]>;
  update: <T extends TableName>(table: T, id: string, patch: Partial<RowOf<T>>) => Promise<RowOf<T>>;
  remove: (table: TableName, id: string) => Promise<void>;
  /** Exclui todos os registros onde `column = value` (ex.: um grupo de parcelas). */
  removeWhere: (table: TableName, column: string, value: string) => Promise<void>;
  upsertMany: <T extends TableName>(table: T, values: Partial<RowOf<T>>[]) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const sb = useMemo(() => getSupabase(), []);
  const [data, setData] = useState<FinanceData>(EMPTY);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const reload = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const {
        data: { user: u },
        error: authError,
      } = await sb.auth.getUser();
      if (authError || !u) {
        hardNavigate("/login");
        return;
      }
      setUser(u);
      const tables = Object.keys(TABLE_KEY) as TableName[];
      const [results, profileRes] = await Promise.all([
        Promise.all(tables.map((t) => fetchAll(sb, t))),
        sb.from("profiles").select("id, full_name").eq("id", u.id).maybeSingle(),
      ]);
      const next = { ...EMPTY, profile: (profileRes.data as Profile | null) ?? { id: u.id, full_name: null } } as FinanceData;
      tables.forEach((t, i) => {
        (next as unknown as Record<string, unknown>)[TABLE_KEY[t]] = results[i];
      });
      setData(next);
      setStatus("ready");
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
      setStatus("error");
    } finally {
      loadingRef.current = false;
    }
  }, [sb]);

  useEffect(() => {
    // Carregamento inicial dos dados do usuário.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") hardNavigate("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [reload, sb]);

  const patchState = useCallback(<T extends TableName>(table: T, fn: (rows: RowOf<T>[]) => RowOf<T>[]) => {
    setData((d) => ({ ...d, [TABLE_KEY[table]]: fn(d[TABLE_KEY[table]] as RowOf<T>[]) }));
  }, []);

  const insertMany = useCallback(
    async <T extends TableName>(table: T, values: Partial<RowOf<T>>[]) => {
      if (values.length === 0) return [];
      const { data: rows, error: e } = await sb.from(table).insert(values as never[]).select();
      if (e) throw new Error(friendlyError(e));
      const normalized = (rows ?? []).map(normalize) as RowOf<T>[];
      patchState(table, (cur) => [...cur, ...normalized]);
      return normalized;
    },
    [sb, patchState],
  );

  const insert = useCallback(
    async <T extends TableName>(table: T, values: Partial<RowOf<T>>) => (await insertMany(table, [values]))[0],
    [insertMany],
  );

  const update = useCallback(
    async <T extends TableName>(table: T, id: string, patch: Partial<RowOf<T>>) => {
      const { data: row, error: e } = await sb.from(table).update(patch as never).eq("id", id).select().single();
      if (e) throw new Error(friendlyError(e));
      const normalized = normalize(row) as RowOf<T>;
      patchState(table, (cur) => cur.map((r) => ((r as { id: string }).id === id ? normalized : r)));
      return normalized;
    },
    [sb, patchState],
  );

  const removeWhere = useCallback(
    async (table: TableName, column: string, value: string) => {
      const { error: e } = await sb.from(table).delete().eq(column, value);
      if (e) throw new Error(friendlyError(e));
      patchState(table, (cur) => cur.filter((r) => (r as unknown as Record<string, unknown>)[column] !== value));
      // Exclusões em cascata no banco: recarrega para manter tudo consistente.
      if (table === "credit_cards" || table === "goals" || table === "accounts" || table === "categories") await reload();
    },
    [sb, patchState, reload],
  );

  const remove = useCallback((table: TableName, id: string) => removeWhere(table, "id", id), [removeWhere]);

  const upsertMany = useCallback(
    async <T extends TableName>(table: T, values: Partial<RowOf<T>>[]) => {
      for (let i = 0; i < values.length; i += 500) {
        const { error: e } = await sb.from(table).upsert(values.slice(i, i + 500) as never[]);
        if (e) throw new Error(friendlyError(e));
      }
    },
    [sb],
  );

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!user) return;
      const { error: e } = await sb.from("profiles").upsert({ id: user.id, ...patch });
      if (e) throw new Error(friendlyError(e));
      setData((d) => ({ ...d, profile: { ...(d.profile ?? { id: user.id, full_name: null }), ...patch } }));
    },
    [sb, user],
  );

  const value = useMemo(
    () => ({ data, user, status, error, reload, insert, insertMany, update, remove, removeWhere, upsertMany, updateProfile }),
    [data, user, status, error, reload, insert, insertMany, update, remove, removeWhere, upsertMany, updateProfile],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance precisa estar dentro de <FinanceProvider>");
  return ctx;
}
