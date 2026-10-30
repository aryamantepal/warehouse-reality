import type { ReactNode } from "react";
import {
  PROVENANCE_LABEL,
  PROVENANCE_TITLE,
} from "@/lib/dashboard/model-call-format";
import type { ProvenanceKind } from "@/types/dashboard";
import type { Provenance } from "@/types/run";

interface ProvenanceBadgeProps {
  kind: ProvenanceKind;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  title?: string;
}

const BADGE_STYLES: Record<ProvenanceKind, string> = {
  src: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  eng: "bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-300",
  drv: "bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300",
  hyp: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  unk: "border border-dashed border-zinc-400 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400",
  ill: "border border-dotted border-sky-500/70 text-sky-600 dark:text-sky-300",
};

const BADGE_BASE =
  "inline-flex whitespace-nowrap items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none";

export const ProvenanceBadge = ({
  kind,
  children,
  className = "",
  onClick,
  title,
}: ProvenanceBadgeProps) => {
  const style = `${BADGE_BASE} ${BADGE_STYLES[kind]} ${className}`;

  if (onClick) {
    return (
      <button
        type="button"
        className={`${style} cursor-pointer hover:opacity-80 transition-opacity`}
        onClick={onClick}
        title={title}
      >
        {children}
      </button>
    );
  }

  return (
    <span className={style} title={title}>
      {children}
    </span>
  );
};

const RUN_STYLES: Readonly<Record<Provenance, string>> = {
  engine: BADGE_STYLES.eng,
  nemotron: "bg-lime-100 text-lime-800 dark:bg-lime-400/15 dark:text-lime-300",
  test_model:
    "bg-orange-100 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300",
  fallback: "bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-300",
  baseline: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200",
  operator: BADGE_STYLES.hyp,
  external_search: BADGE_STYLES.hyp,
  replay: BADGE_STYLES.ill,
};

interface RunProvenanceBadgeProps {
  provenance: Provenance;
  className?: string;
}

/** Who decided a run event; the label comes from the run, never assumed. */
export const RunProvenanceBadge = ({
  provenance,
  className = "",
}: RunProvenanceBadgeProps) => (
  <span
    className={`${BADGE_BASE} ${RUN_STYLES[provenance]} ${className}`}
    title={PROVENANCE_TITLE[provenance]}
  >
    {PROVENANCE_LABEL[provenance]}
  </span>
);
