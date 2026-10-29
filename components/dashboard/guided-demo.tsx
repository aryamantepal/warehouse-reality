"use client";

import { Play } from "lucide-react";
import { useCallback, useState } from "react";
import { TextureButton } from "@/components/ui/texture-button";
import { type GuidedActions, runGuidedDemo } from "@/lib/dashboard/guided-demo";

interface GuidedDemoProps {
  actions: GuidedActions;
  /** Another request is in flight outside the guided flow. */
  busy: boolean;
}

/** One button that runs start -> close D-108 -> step until done, with a status line. */
export const GuidedDemo = ({ actions, busy }: GuidedDemoProps) => {
  const [running, setRunning] = useState(false);
  const [line, setLine] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      await runGuidedDemo(actions, setLine);
    } finally {
      setRunning(false);
    }
  }, [actions]);

  return (
    <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white/90 p-1 text-zinc-950 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-50">
      <TextureButton
        variant="accent"
        size="sm"
        className="w-auto"
        disabled={running || busy}
        onClick={run}
      >
        <Play className="size-3.5" />
        Run the D-108 scenario
      </TextureButton>
      {line && (
        <output
          aria-live="polite"
          className="max-w-64 truncate pr-2 text-[11px] text-zinc-600 dark:text-zinc-400"
          title={line}
        >
          {line}
        </output>
      )}
    </div>
  );
};
