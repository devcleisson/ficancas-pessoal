import { Suspense } from "react";
import { TransactionsPage } from "@/components/transactions/transactions-page";

export const metadata = { title: "Movimentações" };

export default function Page() {
  return (
    <Suspense>
      <TransactionsPage />
    </Suspense>
  );
}
