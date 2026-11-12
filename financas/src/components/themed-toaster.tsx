"use client";

import { useTheme } from "next-themes";
import { Toaster } from "sonner";

/** Notificações (toasts) acompanhando o tema escolhido no app. */
export function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme === "light" ? "light" : "dark"}
      richColors
      closeButton
      toastOptions={{ className: "!rounded-xl" }}
    />
  );
}
