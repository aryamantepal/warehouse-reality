"use client";

import { TextureButton } from "@/components/ui/texture-button";
import type { RunStatus } from "@/lib/dashboard/project-run";

interface RunNoticeProps {
  status: RunStatus;
  error: string | null;
  busy: boolean;
  onStartNew: () => void;
  onRetry: () => void;
}

/**
 * Review Focus 5: an unknown or expired run (e.g. after a server restart) is
 * said plainly and offers a new run. "Watch recorded run" is B8: it needs the
 * recorded snapshot under /runs and a replay button wired to useRun().replay.
 */
export const RunNotice = ({
  status,
  error,
  busy,
  onStartNew,
  onRetry,
}: RunNoticeProps) => {
  if (status === "missing") {
    return (
      <div
        role="alert"
        className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/60 bg-amber-50/95 px-3 py-1.5 text-xs text-amber-900 shadow-sm dark:bg-amber-950/80 dark:text-amber-200"
      >
        <span>
          RUN_NOT_FOUND: this run no longer exists on the server (it may have
          restarted).
        </span>
        <TextureButton
          variant="primary"
          size="sm"
          className="w-auto"
          disabled={busy}
          onClick={onStartNew}
        >
          Start new run
        </TextureButton>
        {/* TODO(B8): "Watch recorded run" -> useRun().replay("/runs/<recording>.json") */}
      </div>
    );
  }
  if (status === "error" && error) {
    return (
      <div
        role="alert"
        className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-red-400/60 bg-red-50/95 px-3 py-1.5 text-xs text-red-900 shadow-sm dark:bg-red-950/80 dark:text-red-200"
      >
        <span>Run error: {error}</span>
        <TextureButton
          variant="minimal"
          size="sm"
          className="w-auto"
          disabled={busy}
          onClick={onRetry}
        >
          Retry
        </TextureButton>
      </div>
    );
  }
  return null;
};
