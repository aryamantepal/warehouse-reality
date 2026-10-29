"use client";

import { useCallback, useState } from "react";
import { TextureButton } from "@/components/ui/texture-button";
import { buildComparison } from "@/lib/dashboard/compare";
import { MAX_GUIDED_STEPS } from "@/lib/dashboard/guided-demo";
import { useRun } from "@/lib/dashboard/use-run";
import type { DisruptionBody } from "@/lib/run/api-schemas";
import type { RunSnapshot } from "@/types/run";

interface ComparePanelProps {
  /** The run being compared; null until one exists. */
  agentsSnapshot: RunSnapshot | null;
  /** Disruptions already applied to that run, replayed onto the baseline. */
  disruptions: readonly DisruptionBody[];
}

const SKY =
  "border-sky-500/60 bg-sky-50 text-sky-900 dark:bg-sky-950/80 dark:text-sky-200";
const AMBER =
  "border-amber-500/60 bg-amber-50 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200";
const TONE = { model: SKY, partly_baseline: AMBER, all_baseline: AMBER };

/** Collapsible agents vs first-come comparison on identical inputs (B7). */
export const ComparePanel = ({
  agentsSnapshot,
  disruptions,
}: ComparePanelProps) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const baselineRun = useRun();
  const { start, disrupt, step } = baselineRun;

  const handleCompare = useCallback(async () => {
    setMessage(null);
    const started = await start("baseline");
    if (started.error) return setMessage(`Baseline failed: ${started.error}`);
    for (const body of disruptions) {
      const r = await disrupt(body);
      if (r.error) return setMessage(`Baseline disruption failed: ${r.error}`);
    }
    for (let n = 0; n < MAX_GUIDED_STEPS; n++) {
      const r = await step();
      if (r.error) return setMessage(`Baseline step failed: ${r.error}`);
      if (r.snapshot?.status === "done") return;
    }
    setMessage("Baseline did not finish within the step limit.");
  }, [start, disrupt, step, disruptions]);

  const baselineSnapshot = baselineRun.snapshot;
  const comparison =
    agentsSnapshot && baselineSnapshot
      ? buildComparison(agentsSnapshot, baselineSnapshot)
      : null;

  return (
    <div className="pointer-events-auto rounded-lg border border-zinc-300 bg-white/95 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900/95">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-1.5 text-left font-medium"
      >
        Compare with first-come rules {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="space-y-2 border-t border-zinc-200 p-3 dark:border-zinc-700">
          {agentsSnapshot ? (
            <TextureButton
              variant="primary"
              size="sm"
              className="w-auto"
              disabled={baselineRun.busy}
              onClick={() => void handleCompare()}
            >
              {baselineRun.busy
                ? "Running baseline…"
                : "Run baseline on same inputs"}
            </TextureButton>
          ) : (
            <p>Start a run and inject the D-108 disruption first.</p>
          )}
          {message && <p role="alert">{message}</p>}
          {comparison && (
            <>
              <output
                className={`block rounded border px-2 py-1 ${TONE[comparison.provenance.kind]}`}
              >
                <strong>{comparison.provenance.title}.</strong>{" "}
                {comparison.provenance.detail}
              </output>
              {comparison.incomplete && (
                <p>One run is not finished; numbers are partial.</p>
              )}
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th scope="col">Metric</th>
                    <th scope="col">Agents</th>
                    <th scope="col">First-come</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row) => (
                    <tr key={row.key}>
                      <th scope="row" className="font-normal">
                        {row.label}
                      </th>
                      <td>{row.agents}</td>
                      <td>{row.baseline}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="font-normal">
                      Model IDs
                    </th>
                    <td>{comparison.agentsModels}</td>
                    <td>{comparison.baselineModels}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
};
