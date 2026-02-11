import React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ErrorBanner(props: { message: string | null | undefined; onDismiss?: () => void; title?: string }) {
  const { message, onDismiss, title = "Error" } = props;
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{message}</span>
        {onDismiss ? (
          <Button variant="outline" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
