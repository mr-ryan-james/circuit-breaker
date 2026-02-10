import React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export type SignalRow = { id: string; name: string; payload: unknown; created_at: string };

export function SignalsTab(props: { signals: SignalRow[] }) {
  const { signals } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signals</CardTitle>
        <CardDescription>Most recent signals (debug).</CardDescription>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <div className="text-sm text-muted-foreground">No signals yet.</div>
        ) : (
          <ScrollArea className="h-[520px] rounded-md border">
            <div className="p-3 space-y-3">
              {signals
                .slice()
                .reverse()
                .slice(0, 20)
                .map((s) => (
                  <div key={s.id} className="rounded-md border p-2">
                    <div className="text-sm">
                      <b>{s.name}</b> <span className="text-xs text-muted-foreground">{s.created_at}</span>
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs">
                      {JSON.stringify(s.payload, null, 2)}
                    </pre>
                  </div>
                ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

