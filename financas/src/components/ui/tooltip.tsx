"use client";
import * as React from "react";
import { Tooltip as P } from "radix-ui";
import { cn } from "@/lib/utils";

const TooltipProvider = P.Provider;

function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <P.Root>
      <P.Trigger asChild>{children}</P.Trigger>
      <P.Portal>
        <P.Content
          side={side}
          sideOffset={6}
          className={cn("z-50 max-w-xs rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0")}
        >
          {content}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

export { Tooltip, TooltipProvider };
