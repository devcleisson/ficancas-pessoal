"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { getSupabase } from "@/lib/supabase/client";
import { AuthCard, FormMessage, SubmitButton, authMessage, useAsync } from "../auth-form";
import { hardNavigate } from "@/lib/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { loading, error, run } = useAsync();

  return (
    <AuthCard
      title="Entrar"
      subtitle="Acesse seu painel financeiro."
      footer={<>Ainda não tem conta? <Link href="/cadastro" className="font-medium text-foreground underline-offset-4 hover:underline">Criar conta</Link></>}
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const { error: err } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
            if (err) throw new Error(authMessage(err.message));
            hardNavigate("/");
          });
        }}
      >
        <Field label="E-mail" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="-mt-1 text-right">
          <Link href="/recuperar-senha" className="text-xs text-muted-foreground hover:text-foreground">Esqueci minha senha</Link>
        </div>
        <FormMessage error={error} />
        <SubmitButton loading={loading}>Entrar</SubmitButton>
      </form>
    </AuthCard>
  );
}
