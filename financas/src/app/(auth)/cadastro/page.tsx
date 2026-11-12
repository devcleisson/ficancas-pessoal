"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { getSupabase } from "@/lib/supabase/client";
import { AuthCard, FormMessage, SubmitButton, authMessage, useAsync } from "../auth-form";
import { hardNavigate } from "@/lib/navigation";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { loading, error, success, setSuccess, run } = useAsync();

  return (
    <AuthCard
      title="Criar conta"
      subtitle="Comece a organizar sua vida financeira."
      footer={<>Já tem conta? <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Entrar</Link></>}
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password))
              throw new Error("A senha precisa ter pelo menos 8 caracteres, com letras e números.");
            if (password !== confirm) throw new Error("As senhas não conferem.");
            const { data, error: err } = await getSupabase().auth.signUp({
              email: email.trim(),
              password,
              options: {
                data: { full_name: name.trim() },
                emailRedirectTo: `${window.location.origin}/auth/callback`,
              },
            });
            if (err) throw new Error(authMessage(err.message));
            if (data.session) {
              hardNavigate("/");
              return;
            }
            setSuccess("Conta criada! Enviamos um link de confirmação para o seu e-mail.");
          });
        }}
      >
        <Field label="Nome" htmlFor="name">
          <Input id="name" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha" htmlFor="password" hint="Mínimo de 8 caracteres, com letras e números.">
          <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirmar senha" htmlFor="confirm">
          <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <FormMessage error={error} success={success} />
        <SubmitButton loading={loading}>Criar conta</SubmitButton>
      </form>
    </AuthCard>
  );
}
