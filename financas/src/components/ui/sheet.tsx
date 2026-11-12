"use client";
import * as React from "react";
import { Dialog as P } from "radix-ui";
import { cn } from "@/lib/utils";

const Sheet = P.Root;
const SheetTrigger = P.Trigger;
const SheetClose = P.Close;
const SheetTitle = P.Title;

function SheetContent({ className, children, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <P.Content
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-sidebar shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left",
          className,
        )}
        {...props}
      >
        {children}
      </P.Content>
    </P.Portal>
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle };
