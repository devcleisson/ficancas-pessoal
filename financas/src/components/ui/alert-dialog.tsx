"use client";
import * as React from "react";
import { AlertDialog as P } from "radix-ui";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

const AlertDialog = P.Root;

function AlertDialogContent({ className, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <P.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-border bg-card p-6 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}

const AlertDialogTitle = ({ className, ...p }: React.ComponentProps<typeof P.Title>) => (
  <P.Title className={cn("text-lg font-semibold", className)} {...p} />
);
const AlertDialogDescription = ({ className, ...p }: React.ComponentProps<typeof P.Description>) => (
  <P.Description className={cn("text-sm text-muted-foreground", className)} {...p} />
);
const AlertDialogCancel = ({ className, ...p }: React.ComponentProps<typeof P.Cancel>) => (
  <P.Cancel className={cn(buttonVariants({ variant: "outline" }), className)} {...p} />
);
const AlertDialogAction = ({ className, ...p }: React.ComponentProps<typeof P.Action>) => (
  <P.Action className={cn(buttonVariants({ variant: "destructive" }), className)} {...p} />
);

export { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction };
