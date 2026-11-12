import { Suspense } from "react";
import { TransactionsPage } from "@/components/transactions/transactions-page";

export const metadata = { title: "Receitas" };

export default function Page() {
  return (
    <Suspense>
      <TransactionsPage kind="income" />
    </Suspense>
  );
}
