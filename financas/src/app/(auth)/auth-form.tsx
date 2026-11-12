"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <Card className="p-6 sm:p-7">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">{subtitle}</p>
        {children}
      </Card>
      {footer && <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>}
    </>
  );
}

export function SubmitButton({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <Button type="submit" className="w-full" size="lg" disabled={loading}>
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

export function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (!error && !success) return null;
  return (
    <p role={error ? "alert" : "status"} className={error ? "rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense" : "rounded-lg bg-income/10 px-3 py-2 text-sm text-income"}>
      {error ?? success}
    </p>
  );
}

export function useAsync() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return { loading, error, success, setSuccess, setError, run };
}

/** Mensagens de erro do Supabase Auth em português. */
export function authMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
  if (m.includes("user already registered") || m.includes("already been registered")) return "Já existe uma conta com este e-mail.";
  if (m.includes("password should be") || m.includes("weak")) return "Senha fraca. Use pelo menos 8 caracteres, com letras e números.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (m.includes("invalid email") || m.includes("unable to validate email")) return "E-mail inválido.";
  if (m.includes("fetch")) return "Não foi possível conectar ao servidor.";
  return message;
}
