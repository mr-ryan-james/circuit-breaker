import React from "react";

import type { ApiStatus } from "@/api/client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export function StatusTab(props: { status: ApiStatus | null }) {
  const { status } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status</CardTitle>
        <CardDescription>Server + WS + token (debug is collapsed by default).</CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible>
          <AccordionItem value="debug">
            <AccordionTrigger>Raw status JSON</AccordionTrigger>
            <AccordionContent>
              <ScrollArea className="h-[260px] rounded-md border">
                <pre className="p-3 text-xs">{JSON.stringify(status, null, 2)}</pre>
              </ScrollArea>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

