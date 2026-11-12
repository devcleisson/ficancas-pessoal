"use client";
import * as React from "react";
import { Select as P } from "radix-ui";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const Select = P.Root;
const SelectValue = P.Value;
const SelectGroup = P.Group;

function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof P.Trigger>) {
  return (
    <P.Trigger
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 aria-invalid:border-destructive data-[placeholder]:text-muted-foreground dark:bg-input/20 [&>span]:truncate",
        className,
      )}
      {...props}
    >
      {children}
      <P.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </P.Icon>
    </P.Trigger>
  );
}

function SelectContent({ className, children, position = "popper", ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        position={position}
        className={cn(
          "relative z-[60] max-h-[min(var(--radix-select-content-available-height),20rem)] min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          position === "popper" && "w-full min-w-[var(--radix-select-trigger-width)] data-[side=bottom]:translate-y-1",
          className,
        )}
        {...props}
      >
        <P.Viewport className="p-1">{children}</P.Viewport>
      </P.Content>
    </P.Portal>
  );
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof P.Item>) {
  return (
    <P.Item
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <P.ItemIndicator>
          <CheckIcon className="size-4" />
        </P.ItemIndicator>
      </span>
      <P.ItemText>{children}</P.ItemText>
    </P.Item>
  );
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof P.Label>) {
  return <P.Label className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)} {...props} />;
}

export { Select, SelectValue, SelectGroup, SelectTrigger, SelectContent, SelectItem, SelectLabel };
