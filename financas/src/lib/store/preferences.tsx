"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface Preferences {
  hideValues: boolean;
  toggleHideValues: () => void;
}

const PreferencesContext = createContext<Preferences | null>(null);
const KEY = "financas:hide-values";

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [hideValues, setHideValues] = useState(false);

  useEffect(() => {
    try {
      // Preferência salva no navegador.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHideValues(localStorage.getItem(KEY) === "1");
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  const toggleHideValues = useCallback(() => {
    setHideValues((v) => {
      try {
        localStorage.setItem(KEY, v ? "0" : "1");
      } catch {
        /* armazenamento indisponível */
      }
      return !v;
    });
  }, []);

  const value = useMemo(() => ({ hideValues, toggleHideValues }), [hideValues, toggleHideValues]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences precisa estar dentro de <PreferencesProvider>");
  return ctx;
}
