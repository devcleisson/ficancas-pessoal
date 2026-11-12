import { Logo } from "@/components/layout/logo";

export const metadata = { title: "Configuração necessária" };

export default function SetupPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-12">
      <Logo />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conecte o Supabase para começar</h1>
        <p className="mt-2 text-muted-foreground">
          O aplicativo salva seus dados em um banco Supabase (PostgreSQL) próprio. Faltam as credenciais do seu projeto.
        </p>
      </div>
      <ol className="grid gap-4 text-sm">
        <li className="rounded-xl border border-border bg-card p-4">
          <p className="font-medium">1. Crie um projeto gratuito</p>
          <p className="mt-1 text-muted-foreground">Acesse supabase.com, crie uma conta e um novo projeto.</p>
        </li>
        <li className="rounded-xl border border-border bg-card p-4">
          <p className="font-medium">2. Crie as tabelas</p>
          <p className="mt-1 text-muted-foreground">
            No painel do Supabase, abra <b>SQL Editor</b>, cole o conteúdo de <code className="rounded bg-muted px-1">supabase/migrations/0001_init.sql</code> e execute.
          </p>
        </li>
        <li className="rounded-xl border border-border bg-card p-4">
          <p className="font-medium">3. Informe as credenciais</p>
          <p className="mt-1 text-muted-foreground">
            Copie <code className="rounded bg-muted px-1">.env.example</code> para <code className="rounded bg-muted px-1">.env.local</code> e preencha
            a URL e a chave <i>anon/publishable</i> (Project Settings → API). Depois reinicie o servidor.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs">{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`}</pre>
        </li>
      </ol>
      <p className="text-sm text-muted-foreground">O passo a passo completo está no arquivo README.md do projeto.</p>
    </div>
  );
}
