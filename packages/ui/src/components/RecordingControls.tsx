import React from "react";

import { Button } from "@/components/ui/button";
import { formatMmSs } from "@/lib/format";

export function RecordingControls(props: {
  isRecording: boolean;
  elapsedMs: number;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
  startLabel?: string;
  stopLabelPrefix?: string;
  hint?: string;
}) {
  const {
    isRecording,
    elapsedMs,
    onStart,
    onStop,
    disabled = false,
    startLabel = "Record",
    stopLabelPrefix = "Stop + Upload",
    hint,
  } = props;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!isRecording ? (
          <Button onClick={onStart} disabled={disabled}>
            {startLabel}
          </Button>
        ) : (
          <Button onClick={onStop} disabled={disabled}>
            {stopLabelPrefix}
          </Button>
        )}

        {isRecording ? (
          <span className="text-sm text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" /> Recording {formatMmSs(elapsedMs)}
          </span>
        ) : null}
      </div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
