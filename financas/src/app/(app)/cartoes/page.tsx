import { Suspense } from "react";
import { CardsView } from "./cards-view";

export const metadata = { title: "Cartões" };

export default function Page() {
  return (
    <Suspense>
      <CardsView />
    </Suspense>
  );
}
