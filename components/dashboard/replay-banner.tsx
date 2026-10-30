import { replayLabel } from "@/lib/dashboard/replay";
import type { RecordedRun } from "@/lib/run/recording";

interface ReplayBannerProps {
  recording: RecordedRun;
}

/** Always visible in replay: says it is a recording, when, and which models. */
export const ReplayBanner = ({ recording }: ReplayBannerProps) => {
  const label = replayLabel(recording);
  const tone =
    label.kind === "model"
      ? "border-sky-500/60 bg-sky-50/95 text-sky-900 dark:bg-sky-950/80 dark:text-sky-200"
      : label.kind === "test_model"
        ? "border-violet-500/60 bg-violet-50/95 text-violet-900 dark:bg-violet-950/80 dark:text-violet-200"
        : "border-amber-500/60 bg-amber-50/95 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200";
  return (
    <output
      aria-live="polite"
      className={`pointer-events-auto block rounded-lg border px-3 py-1.5 text-xs shadow-sm ${tone}`}
    >
      <strong className="font-semibold">{label.title}.</strong> {label.detail}
    </output>
  );
};
