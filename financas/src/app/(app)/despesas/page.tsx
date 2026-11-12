import { Suspense } from "react";
import { TransactionsPage } from "@/components/transactions/transactions-page";

export const metadata = { title: "Despesas" };

export default function Page() {
  return (
    <Suspense>
      <TransactionsPage kind="expense" />
    </Suspense>
  );
}
