"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { getSupabase } from "@/lib/supabase/client";
import { AuthCard, FormMessage, SubmitButton, authMessage, useAsync } from "../auth-form";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const { loading, error, success, setSuccess, run } = useAsync();
  return (
    <AuthCard
      title="Recuperar senha"
      subtitle="Enviaremos um link para você criar uma nova senha."
      footer={<Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Voltar para o login</Link>}
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const { error: err } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
              redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
            });
            if (err) throw new Error(authMessage(err.message));
            setSuccess("Se houver uma conta com este e-mail, você receberá o link em instantes.");
          });
        }}
      >
        <Field label="E-mail" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <FormMessage error={error} success={success} />
        <SubmitButton loading={loading}>Enviar link</SubmitButton>
      </form>
    </AuthCard>
  );
}
