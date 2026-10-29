"use client";

import { useState } from "react";
import { callBadgeOf, provenanceOfCall } from "@/lib/dashboard/call-badge";
import { TIMELINE_EVENTS } from "@/lib/dashboard/data";
import type { RunTimelineEvent } from "@/lib/dashboard/project-run";
import type { TimelineEvent, TimelineEventType } from "@/types/dashboard";
import type { ModelCall } from "@/types/run";
import { ModelCallBadge } from "./call-badge";
import { ProvenanceBadge } from "./provenance-badge";

const CARD_STYLES: Record<TimelineEventType, string> = {
  disruption:
    "border-amber-500/60 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200",
  engine:
    "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200",
  stale:
    "border-red-400/60 bg-red-50/50 dark:bg-red-950/20 text-red-900 dark:text-red-300",
  offer:
    "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200",
  accept:
    "border-blue-400/60 bg-blue-50/30 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200",
  commit:
    "border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 font-medium",
  action:
    "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200",
  scheduled:
    "border-dashed border-zinc-400 dark:border-zinc-700 bg-zinc-50/40 dark:bg-zinc-950/20 text-zinc-500",
};

/** A run event, or an illustrative one (which has no run provenance). */
type TimelineItem = TimelineEvent & Partial<RunTimelineEvent>;

interface CausalTimelineProps {
  /** Projected run events; the illustrative preview only when there is no run. */
  events?: readonly TimelineItem[];
  /** The run's model calls, so a turn can show its model, latency and tokens. */
  calls?: readonly ModelCall[];
  /** True when the events come from a server run. */
  fromRun?: boolean;
}

interface TurnBadgeProps {
  call: ModelCall;
  events: readonly TimelineItem[];
}

/** The model call behind a turn: source, model, tier, latency and tokens. */
const TurnBadge = ({ call, events }: TurnBadgeProps) => {
  const provenance = provenanceOfCall(
    call,
    events.filter((e): e is RunTimelineEvent => e.provenance !== undefined),
  );
  return <ModelCallBadge badge={callBadgeOf(call, provenance)} />;
};

/** The newest event that has happened; scheduled ones are still in the future. */
const latestOf = (events: readonly TimelineItem[]): TimelineItem | undefined =>
  events.findLast((e) => e.type !== "scheduled") ?? events[0];

/**
 * One line with the latest event; it opens into the full causal chain on a
 * line of its own. Both are items of the parent flex-wrap row.
 */
export const CausalTimeline = ({
  events = TIMELINE_EVENTS,
  calls = [],
  fromRun = false,
}: CausalTimelineProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const latest = latestOf(events);
  const callsById = new Map(calls.map((c) => [c.id, c]));

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="causal-timeline"
        className="pointer-events-auto order-last flex h-9 min-w-0 grow basis-full items-center gap-2 sm:order-none sm:basis-0 rounded-lg border border-zinc-200 bg-white/90 px-2.5 text-xs text-zinc-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        <span className="text-[10px]">{isOpen ? "▾" : "▸"}</span>
        {latest ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="font-mono text-[10px] text-zinc-500">
              {latest.time}
            </span>
            <span className="font-mono font-semibold">{latest.source}</span>
            <span className="truncate">{latest.title}</span>
          </span>
        ) : (
          <span>No events yet</span>
        )}
        {fromRun ? (
          <ProvenanceBadge kind="drv">run</ProvenanceBadge>
        ) : (
          <ProvenanceBadge kind="ill">illustrative</ProvenanceBadge>
        )}
      </button>

      {isOpen && (
        <div
          id="causal-timeline"
          className="pointer-events-auto order-last min-w-0 basis-full rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95"
        >
          <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span className="font-semibold uppercase tracking-wider">
              {fromRun
                ? `Causal timeline · ${events.length} run events`
                : "Causal timeline · illustrative preview, no run yet"}
            </span>
            <span className="hidden font-mono sm:inline">
              Inference reported separately from logical time
            </span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pt-2 pb-1 text-xs">
            {events.map((evt, idx) => (
              <div key={evt.id} className="flex shrink-0 items-center gap-1.5">
                <div
                  className={`flex min-w-36 flex-col gap-0.5 rounded-md border px-2.5 py-1.5 text-[11px] leading-tight ${CARD_STYLES[evt.type]}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[10px] opacity-75">
                      {evt.time}
                    </span>
                    {evt.tag && (
                      <ProvenanceBadge kind="hyp">{evt.tag}</ProvenanceBadge>
                    )}
                  </div>
                  <div className="font-mono text-[11px] font-semibold">
                    {evt.source}
                  </div>
                  <div className="max-w-44 truncate" title={evt.title}>
                    {evt.title}
                  </div>
                  {evt.reasonCode && (
                    <div className="font-mono text-[10px] font-semibold text-red-700 dark:text-red-400">
                      {evt.reasonCode}
                    </div>
                  )}
                  {evt.modelCallId && callsById.has(evt.modelCallId) && (
                    <TurnBadge
                      call={callsById.get(evt.modelCallId) as ModelCall}
                      events={events}
                    />
                  )}
                </div>
                {idx < events.length - 1 && (
                  <span className="select-none text-xs text-zinc-400">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
