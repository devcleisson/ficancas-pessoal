# Finanças — controle financeiro pessoal

Aplicação web para controlar receitas, despesas, cartões de crédito, contas bancárias, orçamento, contas recorrentes e metas. Todos os indicadores e gráficos são calculados a partir dos dados que você cadastra — nada de dados fictícios.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · componentes no padrão shadcn/ui (Radix) · Recharts · Lucide · Supabase (PostgreSQL + Auth) com Row Level Security.

---

## 1. Configurar o Supabase (≈ 5 minutos)

1. Crie uma conta em [supabase.com](https://supabase.com) e um **novo projeto** (o plano gratuito é suficiente).
2. No painel do projeto, abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/migrations/0001_init.sql` e clique em **Run**.
   Isso cria as tabelas, as regras de segurança (cada usuário só acessa os próprios dados) e as categorias padrão de cada novo usuário.
3. Em **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:3000` (depois troque pelo endereço de produção).
   - **Redirect URLs:** adicione `http://localhost:3000/auth/callback` (e o equivalente de produção, ex.: `https://seu-app.vercel.app/auth/callback`).
4. (Opcional) Em **Authentication → Providers → Email**, desative *Confirm email* se quiser entrar sem confirmar o e-mail. Com a confirmação ligada, o usuário recebe um link que volta para `/auth/callback`.
5. Em **Project Settings → API**, copie a **Project URL** e a chave **anon / publishable**.

## 2. Rodar localmente

Requisitos: Node.js 20.9+ (recomendado 22).

```bash
npm install
cp .env.example .env.local     # preencha com a URL e a chave do passo 5
npm run dev
```

Abra http://localhost:3000, crie sua conta e comece cadastrando suas contas com o saldo atual (menu **Contas**).

Sem o `.env.local` preenchido, o app mostra uma página explicando a configuração em vez de simular dados.

## 3. Publicar (Vercel)

1. Envie o projeto para um repositório no GitHub.
2. Em [vercel.com](https://vercel.com) → *Add New Project* → importe o repositório.
3. Adicione as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Depois do deploy, atualize **Site URL** e **Redirect URLs** no Supabase com o domínio da Vercel.

---

## Funcionalidades

| Área | O que faz |
|---|---|
| **Visão geral** | Saldo total, receitas/despesas/resultado do mês, renda comprometida, total guardado, comparação com o mês anterior, gráficos (receitas × despesas, evolução do saldo, gastos por categoria, histórico de 12 meses), últimas movimentações e próximos vencimentos. |
| **Receitas / Despesas / Movimentações** | Cadastro, edição (toque no lançamento), exclusão, marcar como pago/recebido, busca e filtros por período, categoria (inclusive "Sem categoria"), forma de pagamento, status, fixa/variável e conta. Seleção múltipla para definir categoria, marcar como pago ou excluir em lote. |
| **Importar extrato** | Extrato da conta ou fatura do cartão em **OFX** ou **CSV** (detecção automática de colunas, UTF-8 ou Windows-1252). Sugere categorias por palavras-chave e pelo seu histórico, aplica a mesma categoria a lançamentos parecidos, reconhece lançamentos já existentes e permite revisar tudo antes de salvar. |
| **Cartões** | Vários cartões, limite total e disponível (calculado), fatura atual com período de compras, histórico de faturas, status (aberta, fechada, paga, parcial, vencida), compras parceladas e pagamento de fatura (debitado de uma conta). |
| **Contas** | Contas bancárias, poupança, investimentos e dinheiro em espécie; saldo calculado; transferências entre contas; arquivamento. |
| **Orçamento** | Limite mensal por categoria, barras de progresso e alertas em 70%, 90% e ao ultrapassar. |
| **Contas fixas** | Recorrência semanal, mensal ou anual; atrasadas e próximas; pagar (gera a despesa e avança o vencimento), pular, pausar. |
| **Metas** | Valor desejado, acumulado, prazo, progresso, aporte mensal necessário, adicionar/retirar valores e histórico. |
| **Calendário** | Receitas, despesas, contas recorrentes e faturas por dia. |
| **Relatórios** | Mensal, anual ou período personalizado; comparativo entre meses, maiores categorias, evolução de receitas e despesas, taxa de economia, histórico completo; exportação **CSV** e **PDF**. |
| **Extras** | Busca global (Ctrl/⌘ + K), notificações de vencimentos e orçamento, ocultar valores, tema escuro (padrão) e claro, layout responsivo, importação de CSV, backup/restauração em JSON, categorias personalizáveis. |

## Regras de cálculo

- **Saldo de uma conta** = saldo inicial + receitas recebidas − despesas pagas ± transferências − pagamentos de fatura. Lançamentos **pendentes não alteram o saldo**.
- **Compras no cartão** contam como despesa na data da compra (regime de competência) e só saem do saldo quando a fatura é paga — assim nada é contado duas vezes.
- **Fatura:** compras feitas no dia do fechamento ou depois entram na fatura seguinte. Parcelas são lançadas uma por mês e caem cada uma em sua fatura.
- **Limite disponível** = limite − (todas as compras, inclusive parcelas futuras − pagamentos).
- **Total guardado** = saldo em contas de poupança/investimentos + valores acumulados nas metas.
- **Renda comprometida** = despesas do mês ÷ receitas do mês. **Taxa de economia** = (receitas − despesas) ÷ receitas.
- Valores são somados em centavos para evitar erros de arredondamento.

## Segurança

- Autenticação por e-mail e senha (Supabase Auth); rotas protegidas pelo `src/proxy.ts`.
- **Row Level Security** em todas as tabelas: um usuário nunca lê nem altera dados de outro, mesmo chamando a API diretamente. Chaves estrangeiras compostas impedem referenciar registros de outra pessoa.
- Validações no formulário **e** no banco (valores positivos, datas válidas, conta obrigatória em lançamentos pagos etc.).
- A chave usada no navegador é a pública (*anon*); nunca coloque a `service_role` no projeto.

## Estrutura

```
supabase/migrations/   esquema SQL, RLS e gatilho de novo usuário
src/app/(auth)/        login, cadastro, recuperação de senha
src/app/(app)/         telas do sistema (visão geral, receitas, despesas, cartões…)
src/components/        UI (ui/), layout, gráficos, formulários de lançamentos
src/lib/finance.ts     regras financeiras puras (saldos, faturas, orçamento, metas…)
src/lib/format.ts      moeda e datas no padrão brasileiro
src/lib/validation.ts  validações dos formulários
src/lib/store/         carregamento e gravação dos dados no Supabase
test/                  testes unitários, de banco/RLS e de ponta a ponta
```

## Testes

```bash
npm test            # regras financeiras + migração SQL e RLS em Postgres real (PGlite)
npm run typecheck
npm run lint
```

Teste de ponta a ponta no navegador (usa um Supabase simulado sobre Postgres em memória, com o mesmo esquema e RLS):

```bash
npm run mock:supabase &                                  # porta 54321
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=chave-de-teste-local-123456 npm run build
npx next start -p 3000 &
CHROME=/caminho/do/chrome npm run test:e2e
```

O roteiro cobre cadastro, login, contas, receitas, despesas, validações, cartão com parcelamento e pagamento de fatura, orçamento e alertas, recorrentes, metas, indicadores do painel, persistência, busca, filtros, exportação CSV/PDF, tema, celular, logout e isolamento entre usuários.
