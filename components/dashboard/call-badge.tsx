import {
  budgetFractions,
  type CallBadgeView,
  type CallSource,
} from "@/lib/dashboard/call-badge";
import type { RunBudget } from "@/types/run";

const SOURCE_STYLES: Record<CallSource, string> = {
  nemotron:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300",
  fallback: "bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-300",
  baseline: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200",
  other:
    "border border-dashed border-zinc-400 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400",
};

interface SourceTagProps {
  source: CallSource;
  label: string;
}

/** NEMOTRON, FALLBACK, BASELINE or the raw provenance, in capitals. */
export const SourceTag = ({ source, label }: SourceTagProps) => (
  <span
    className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase leading-none ${SOURCE_STYLES[source]}`}
  >
    {label}
  </span>
);

interface ModelCallBadgeProps {
  badge: CallBadgeView;
}

/** Source tag plus model, tier, latency and tokens for one model call. */
export const ModelCallBadge = ({ badge }: ModelCallBadgeProps) => (
  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
    <SourceTag source={badge.source} label={badge.label} />
    <span className="max-w-40 truncate" title={badge.model}>
      {badge.model}
    </span>
    <span>· {badge.tier}</span>
    <span>· {badge.latency}</span>
    <span>· {badge.tokens}</span>
    {badge.fallbackReason && (
      <span className="text-red-700 dark:text-red-400">
        · {badge.fallbackReason}
      </span>
    )}
  </div>
);

interface MeterProps {
  label: string;
  value: string;
  fraction: number;
}

const Meter = ({ label, value, fraction }: MeterProps) => (
  <div className="space-y-0.5">
    <div className="flex justify-between font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
      <span>{label}</span>
      <span>{value}</span>
    </div>
    <progress
      className="block h-1.5 w-full overflow-hidden rounded [&::-moz-progress-bar]:bg-blue-500 [&::-webkit-progress-bar]:bg-zinc-200 [&::-webkit-progress-value]:bg-blue-500 dark:[&::-webkit-progress-bar]:bg-zinc-800"
      value={fraction}
      max={1}
      aria-label={label}
    />
  </div>
);

interface BudgetMeterProps {
  budget: RunBudget;
}

/** Model calls out of the 60 cap and tokens out of the 150k cap. */
export const BudgetMeter = ({ budget }: BudgetMeterProps) => {
  const f = budgetFractions(budget);
  return (
    <div className="space-y-1.5">
      <Meter
        label="Model calls"
        value={`${budget.calls} / ${budget.capCalls}`}
        fraction={f.calls}
      />
      <Meter
        label="Tokens"
        value={`${budget.tokens.toLocaleString("en-US")} / ${budget.capTokens.toLocaleString("en-US")}`}
        fraction={f.tokens}
      />
      {budget.exhausted && (
        <p className="text-[10px] text-amber-700 dark:text-amber-400">
          Budget reached: remaining turns use the FCFS baseline.
        </p>
      )}
    </div>
  );
};
