"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { getSupabase } from "@/lib/supabase/client";
import { AuthCard, FormMessage, SubmitButton, authMessage, useAsync } from "../auth-form";
import { hardNavigate } from "@/lib/navigation";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { loading, error, run } = useAsync();
  return (
    <AuthCard title="Nova senha" subtitle="Escolha uma nova senha para sua conta.">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password))
              throw new Error("A senha precisa ter pelo menos 8 caracteres, com letras e números.");
            if (password !== confirm) throw new Error("As senhas não conferem.");
            const { error: err } = await getSupabase().auth.updateUser({ password });
            if (err) throw new Error(authMessage(err.message));
            hardNavigate("/");
          });
        }}
      >
        <Field label="Nova senha" htmlFor="password">
          <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirmar nova senha" htmlFor="confirm">
          <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <FormMessage error={error} />
        <SubmitButton loading={loading}>Salvar nova senha</SubmitButton>
      </form>
    </AuthCard>
  );
}
