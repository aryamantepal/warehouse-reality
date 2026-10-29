"use client";

import { TextureButton } from "@/components/ui/texture-button";
import type { RunStatus } from "@/lib/dashboard/project-run";
import { NO_RECORDING } from "@/lib/dashboard/replay";

interface RunNoticeProps {
  status: RunStatus;
  error: string | null;
  busy: boolean;
  onStartNew: () => void;
  onRetry: () => void;
  onWatchRecording: () => void;
}

/**
 * Review Focus 5: an unknown or expired run (e.g. after a server restart) is
 * said plainly and offers a new run or the recorded run (B8).
 */
export const RunNotice = ({
  status,
  error,
  busy,
  onStartNew,
  onRetry,
  onWatchRecording,
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
        <TextureButton
          variant="minimal"
          size="sm"
          className="w-auto"
          disabled={busy}
          onClick={onWatchRecording}
        >
          Watch recorded run
        </TextureButton>
      </div>
    );
  }
  if (error === NO_RECORDING) {
    return (
      <div
        role="alert"
        className="pointer-events-auto rounded-lg border border-zinc-400/60 bg-zinc-50/95 px-3 py-1.5 text-xs text-zinc-900 shadow-sm dark:bg-zinc-900/90 dark:text-zinc-200"
      >
        No recording yet: no recorded run has been published with this build.
        Start a live run instead.
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
