import React from "react";

import { ActivityDot } from "@/components/ActivityDot";
import { cn } from "@/lib/utils";

export function SessionBanner(props: {
  active: boolean;
  label: string;
  detail?: string | null;
  rawId?: string | number | null;
  actions?: React.ReactNode;
  className?: string;
}) {
  const { active, label, detail, rawId, actions, className } = props;

  return (
    <div className={cn("rounded-md border px-3 py-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <ActivityDot className={active ? "bg-emerald-500" : "animate-none bg-muted-foreground/40"} />
          <span className="truncate text-sm text-muted-foreground" title={rawId ? String(rawId) : undefined}>
            {label}
          </span>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}
