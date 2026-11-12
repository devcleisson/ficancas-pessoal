export type Kind = "income" | "expense";
export type TxStatus = "paid" | "pending";
export type ExpenseType = "fixed" | "variable";
export type Frequency = "weekly" | "monthly" | "yearly";
export type AccountType = "checking" | "savings" | "investment" | "cash" | "other";
export type PaymentMethod =
  | "pix"
  | "cash"
  | "debit"
  | "credit"
  | "boleto"
  | "transfer"
  | "auto_debit"
  | "deposit"
  | "other";

/** Datas são sempre strings "YYYY-MM-DD" (data local, sem fuso). */
export type ISODate = string;

export interface Profile {
  id: string;
  full_name: string | null;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  kind: Kind;
  color: string;
  icon: string;
  is_default: boolean;
  created_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  initial_balance: number;
  color: string;
  archived: boolean;
  created_at: string;
}

export interface CreditCard {
  id: string;
  user_id: string;
  name: string;
  institution: string | null;
  limit_amount: number;
  closing_day: number;
  due_day: number;
  color: string;
  default_account_id: string | null;
  archived: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  kind: Kind;
  description: string;
  amount: number;
  date: ISODate;
  category_id: string | null;
  account_id: string | null;
  card_id: string | null;
  payment_method: PaymentMethod;
  status: TxStatus;
  expense_type: ExpenseType | null;
  source: string | null;
  notes: string | null;
  installment_group: string | null;
  installment_number: number | null;
  installment_total: number | null;
  recurring_bill_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transfer {
  id: string;
  user_id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  date: ISODate;
  description: string | null;
  created_at: string;
}

export interface CardPayment {
  id: string;
  user_id: string;
  card_id: string;
  /** Primeiro dia do mês de vencimento da fatura (YYYY-MM-01). */
  reference_month: ISODate;
  amount: number;
  date: ISODate;
  account_id: string;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
  created_at: string;
}

export interface RecurringBill {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  category_id: string | null;
  frequency: Frequency;
  next_due_date: ISODate;
  anchor_day: number;
  account_id: string | null;
  payment_method: PaymentMethod;
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  deadline: ISODate | null;
  color: string;
  icon: string;
  archived: boolean;
  created_at: string;
}

export interface GoalContribution {
  id: string;
  user_id: string;
  goal_id: string;
  amount: number;
  date: ISODate;
  note: string | null;
  created_at: string;
}

export interface FinanceData {
  profile: Profile | null;
  categories: Category[];
  accounts: Account[];
  cards: CreditCard[];
  transactions: Transaction[];
  transfers: Transfer[];
  cardPayments: CardPayment[];
  budgets: Budget[];
  bills: RecurringBill[];
  goals: Goal[];
  contributions: GoalContribution[];
}

export type TableName =
  | "categories"
  | "accounts"
  | "credit_cards"
  | "transactions"
  | "transfers"
  | "card_payments"
  | "budgets"
  | "recurring_bills"
  | "goals"
  | "goal_contributions";

/** Campos gerenciados pelo banco, nunca enviados pelo cliente. */
export type Managed = "id" | "user_id" | "created_at" | "updated_at";
export type NewRow<T> = Omit<T, Managed>;
