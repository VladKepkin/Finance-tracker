import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export function Disclosure({
  title,
  children,
  defaultOpen,
  className,
  bare,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  bare?: boolean;
}) {
  return (
    <details
      data-slot="disclosure"
      open={defaultOpen}
      className={cn(
        bare ? "group" : "group bg-card text-card-foreground soft-shadow rounded-xl border border-border/60 py-4",
        className
      )}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between font-semibold leading-none marker:content-none [&::-webkit-details-marker]:hidden",
          bare ? "py-4" : "px-4"
        )}
      >
        {title}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className={bare ? "pt-3" : "px-4 pt-3"}>{children}</div>
    </details>
  );
}
