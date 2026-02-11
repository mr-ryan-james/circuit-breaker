import React from "react";

import { cn } from "@/lib/utils";

export function ActivityDot(props: { className?: string }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full bg-primary animate-pulse", props.className)} />;
}
