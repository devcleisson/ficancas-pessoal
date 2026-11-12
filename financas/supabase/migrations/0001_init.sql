-- =====================================================================
-- Finanças Pessoais — esquema inicial
-- Execute este arquivo no SQL Editor do Supabase (ou via `supabase db push`).
-- Todas as tabelas são protegidas por Row Level Security: cada usuário
-- só enxerga e altera os próprios registros.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 80),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Categorias (receitas e despesas)
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  kind text not null check (kind in ('income', 'expense')),
  color text not null default '#71717a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null default 'circle' check (char_length(icon) <= 40),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, kind, name),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- Contas bancárias e dinheiro em espécie
-- ---------------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  type text not null check (type in ('checking', 'savings', 'investment', 'cash', 'other')),
  institution text check (char_length(institution) <= 60),
  initial_balance numeric(14, 2) not null default 0 check (abs(initial_balance) < 1000000000000),
  color text not null default '#10b981' check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- Cartões de crédito
-- ---------------------------------------------------------------------
create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  institution text check (char_length(institution) <= 60),
  limit_amount numeric(14, 2) not null check (limit_amount > 0 and limit_amount < 1000000000000),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  color text not null default '#3f3f46' check (color ~ '^#[0-9a-fA-F]{6}$'),
  default_account_id uuid,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (default_account_id, user_id) references public.accounts (id, user_id) on delete set null (default_account_id)
);

-- ---------------------------------------------------------------------
-- Contas fixas e recorrentes
-- ---------------------------------------------------------------------
create table if not exists public.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  amount numeric(14, 2) not null check (amount > 0 and amount < 1000000000000),
  category_id uuid,
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  next_due_date date not null,
  anchor_day smallint not null check (anchor_day between 1 and 31),
  account_id uuid,
  payment_method text not null default 'boleto'
    check (payment_method in ('pix', 'cash', 'debit', 'credit', 'boleto', 'transfer', 'auto_debit', 'other')),
  active boolean not null default true,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete set null (account_id)
);

-- ---------------------------------------------------------------------
-- Movimentações (receitas e despesas)
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  description text not null check (char_length(btrim(description)) between 1 and 120),
  amount numeric(14, 2) not null check (amount > 0 and amount < 1000000000000),
  date date not null,
  category_id uuid,
  account_id uuid,
  card_id uuid,
  payment_method text not null
    check (payment_method in ('pix', 'cash', 'debit', 'credit', 'boleto', 'transfer', 'auto_debit', 'deposit', 'other')),
  status text not null default 'paid' check (status in ('paid', 'pending')),
  expense_type text check (expense_type in ('fixed', 'variable')),
  source text check (char_length(source) <= 80),
  notes text check (char_length(notes) <= 500),
  installment_group uuid,
  installment_number smallint check (installment_number between 1 and 48),
  installment_total smallint check (installment_total between 1 and 48),
  recurring_bill_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict,
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (card_id, user_id) references public.credit_cards (id, user_id) on delete cascade,
  foreign key (recurring_bill_id, user_id) references public.recurring_bills (id, user_id) on delete set null (recurring_bill_id),
  -- Compras no cartão: sempre despesa, forma "crédito", sem conta debitada.
  constraint card_purchase_shape check (
    card_id is null or (kind = 'expense' and payment_method = 'credit' and account_id is null)
  ),
  -- Lançamentos efetivados fora do cartão precisam de uma conta.
  constraint paid_needs_account check (
    card_id is not null or status = 'pending' or account_id is not null
  ),
  constraint expense_type_only_for_expenses check (kind = 'expense' or expense_type is null),
  constraint installment_consistency check (
    (installment_group is null and installment_number is null and installment_total is null)
    or (installment_group is not null and installment_number is not null and installment_total is not null
        and installment_number <= installment_total)
  )
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_card_idx on public.transactions (card_id) where card_id is not null;
create index if not exists transactions_group_idx on public.transactions (installment_group) where installment_group is not null;

-- ---------------------------------------------------------------------
-- Transferências entre contas
-- ---------------------------------------------------------------------
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_account_id uuid not null,
  to_account_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0 and amount < 1000000000000),
  date date not null,
  description text check (char_length(description) <= 120),
  created_at timestamptz not null default now(),
  check (from_account_id <> to_account_id),
  foreign key (from_account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (to_account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Pagamentos de fatura de cartão
-- reference_month = primeiro dia do mês de vencimento da fatura
-- ---------------------------------------------------------------------
create table if not exists public.card_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null,
  reference_month date not null check (extract(day from reference_month) = 1),
  amount numeric(14, 2) not null check (amount > 0 and amount < 1000000000000),
  date date not null,
  account_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (card_id, user_id) references public.credit_cards (id, user_id) on delete cascade,
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict
);

create index if not exists card_payments_card_idx on public.card_payments (card_id, reference_month);

-- ---------------------------------------------------------------------
-- Orçamento mensal por categoria
-- ---------------------------------------------------------------------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0 and amount < 1000000000000),
  created_at timestamptz not null default now(),
  unique (user_id, category_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Metas financeiras
-- ---------------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  target_amount numeric(14, 2) not null check (target_amount > 0 and target_amount < 1000000000000),
  deadline date,
  color text not null default '#10b981' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null default 'target' check (char_length(icon) <= 40),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null,
  amount numeric(14, 2) not null check (amount <> 0 and abs(amount) < 1000000000000),
  date date not null,
  note text check (char_length(note) <= 120),
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch
  before update on public.transactions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'accounts', 'credit_cards', 'recurring_bills', 'transactions',
    'transfers', 'card_payments', 'budgets', 'goals', 'goal_contributions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own_rows" on public.%I', t);
    execute format(
      'create policy "own_rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

alter table public.profiles enable row level security;
drop policy if exists "own_profile" on public.profiles;
create policy "own_profile" on public.profiles for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Acesso explícito apenas para usuários autenticados.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------
-- Dados iniciais de cada novo usuário: perfil, categorias padrão e carteira
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''))
  on conflict (id) do nothing;

  insert into public.categories (user_id, name, kind, color, icon, is_default) values
    (new.id, 'Salário',          'income',  '#10b981', 'briefcase',      true),
    (new.id, 'Freelance',        'income',  '#14b8a6', 'laptop',         true),
    (new.id, 'Serviços',         'income',  '#06b6d4', 'wrench',         true),
    (new.id, 'Vendas',           'income',  '#22c55e', 'shopping-bag',   true),
    (new.id, 'Investimentos',    'income',  '#84cc16', 'trending-up',    true),
    (new.id, 'Outras receitas',  'income',  '#a3a3a3', 'plus-circle',    true),
    (new.id, 'Alimentação',      'expense', '#f97316', 'utensils',       true),
    (new.id, 'Moradia',          'expense', '#8b5cf6', 'home',           true),
    (new.id, 'Transporte',       'expense', '#3b82f6', 'car',            true),
    (new.id, 'Saúde',            'expense', '#ef4444', 'heart-pulse',    true),
    (new.id, 'Academia',         'expense', '#ec4899', 'dumbbell',       true),
    (new.id, 'Lazer',            'expense', '#eab308', 'party-popper',   true),
    (new.id, 'Assinaturas',      'expense', '#6366f1', 'repeat',         true),
    (new.id, 'Educação',         'expense', '#0ea5e9', 'graduation-cap', true),
    (new.id, 'Compras',          'expense', '#d946ef', 'shopping-cart',  true),
    (new.id, 'Tecnologia',       'expense', '#64748b', 'cpu',            true),
    (new.id, 'Cartão de crédito','expense', '#f43f5e', 'credit-card',    true),
    (new.id, 'Outros',           'expense', '#78716c', 'circle',         true)
  on conflict do nothing;

  insert into public.accounts (user_id, name, type, initial_balance, color)
  values (new.id, 'Carteira', 'cash', 0, '#10b981');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
