"use client";

import { DEPENDENCIES, UNKNOWN_DFW_FIELDS } from "@/lib/dashboard/data";
import type { RunCounts } from "@/lib/dashboard/project-run";
import { S1 } from "@/lib/scene/facility";
import type { ProvenanceKind } from "@/types/dashboard";
import { ProvenanceBadge } from "./provenance-badge";

interface FacilityPanelProps {
  isOpen: boolean;
  /** Engine counts, or the illustrative preview's before any run. */
  counts: RunCounts;
  /** True when counts and doors come from a server run's engine snapshot. */
  fromRun: boolean;
  stateVersion: number | null;
  closedDoors: readonly string[];
  reservedDoors: readonly string[];
  onToggle: () => void;
  onSelectEntity: (id: string) => void;
  onOpenEvidence: () => void;
}

const LEGEND: readonly {
  kind: ProvenanceKind;
  badge: string;
  meaning: string;
}[] = [
  { kind: "src", badge: "S1", meaning: "published spec" },
  { kind: "drv", badge: "derived", meaning: "derived conversion" },
  { kind: "hyp", badge: "hypothetical", meaning: "injected" },
  { kind: "unk", badge: "unknown", meaning: "no evidence" },
  { kind: "ill", badge: "illus→sim", meaning: "placeholder" },
];

/** Engine banner, profile, workload and provenance legend; moved here from the old top bar and banner. */
interface RunContextProps {
  stateVersion: number | null;
}

const RunContext = ({ stateVersion }: RunContextProps) => (
  <div className="space-y-1.5 text-zinc-700 dark:text-zinc-300">
    <p className="rounded-md border border-dashed border-amber-500/60 bg-amber-50/50 px-2 py-1 text-[11px] text-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
      {stateVersion === null
        ? "No run yet: illustrative preview only. The layout is schematic until a site plan is traced."
        : `Run state: engine v${stateVersion} · S1 physical invariants enforced. Layout is schematic.`}
    </p>
    <div className="flex items-center justify-between">
      <span>Profile</span>
      <span className="flex items-center gap-1 font-medium">
        DFW Bldg I <ProvenanceBadge kind="src">v1 · S1</ProvenanceBadge>
      </span>
    </div>
    <div className="flex items-center justify-between">
      <span>Workload</span>
      <span className="flex items-center gap-1 font-medium">
        Demo Day v2 <ProvenanceBadge kind="drv">vol derived</ProvenanceBadge>
      </span>
    </div>
    <ul className="flex flex-wrap gap-x-2 gap-y-1 pt-1 text-[11px]">
      {LEGEND.map(({ kind, badge, meaning }) => (
        <li key={kind} className="flex items-center gap-1">
          <ProvenanceBadge kind={kind}>{badge}</ProvenanceBadge>
          <span className="text-zinc-500">{meaning}</span>
        </li>
      ))}
    </ul>
  </div>
);

interface DoorLinksProps {
  ids: readonly string[];
  tone: string;
  onSelectEntity: (id: string) => void;
}

const MAX_LINKS = 4;

const DoorLinks = ({ ids, tone, onSelectEntity }: DoorLinksProps) =>
  ids.length === 0 ? (
    <span className="text-zinc-400">none</span>
  ) : (
    <>
      {ids.slice(0, MAX_LINKS).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelectEntity(id)}
          className={`font-mono underline ${tone}`}
        >
          {id}
        </button>
      ))}
      {ids.length > MAX_LINKS && <span>+{ids.length - MAX_LINKS}</span>}
    </>
  );

export const FacilityPanel = ({
  isOpen,
  counts,
  fromRun,
  stateVersion,
  closedDoors,
  reservedDoors,
  onToggle,
  onSelectEntity,
  onOpenEvidence,
}: FacilityPanelProps) => {
  if (!isOpen) return null;

  return (
    <aside
      aria-label="Facility resources"
      className="pointer-events-auto absolute inset-y-0 left-0 flex w-72 max-w-full flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white/95 shadow-lg backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95"
    >
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Facility Resources
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="grid size-6 place-items-center rounded text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Close facility panel"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        <RunContext stateVersion={stateVersion} />
        {/* Published Capacity */}
        <details open className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold uppercase tracking-wider text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
            <span className="flex items-center gap-1">
              <span className="transition-transform group-open:rotate-90">
                ▸
              </span>
              Published Capacity
            </span>
            <ProvenanceBadge kind="src">S1</ProvenanceBadge>
          </summary>
          <div className="space-y-1 text-zinc-700 dark:text-zinc-300">
            <div className="flex justify-between">
              <span>Dock-high doors</span>
              <span className="font-mono font-medium">{S1.dockDoors}</span>
            </div>
            <div className="flex justify-between">
              <span>Ramp doors</span>
              <span className="font-mono font-medium">{S1.rampDoors}</span>
            </div>
            <div className="flex justify-between">
              <span>Trailer spaces</span>
              <span className="font-mono font-medium">{S1.trailerSpaces}</span>
            </div>
            <div className="flex justify-between">
              <span>Automobile spaces</span>
              <span className="font-mono font-medium">572</span>
            </div>
            <div className="flex justify-between">
              <span>Gross floor area</span>
              <span className="font-mono font-medium">1,000,584 sf</span>
            </div>
          </div>
        </details>

        {/* Workload Volume */}
        <details
          open
          className="group border-t border-zinc-100 dark:border-zinc-800/60 pt-2"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold uppercase tracking-wider text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
            <span className="flex items-center gap-1">
              <span className="transition-transform group-open:rotate-90">
                ▸
              </span>
              Workload Volume
            </span>
          </summary>
          <div className="space-y-1 text-zinc-700 dark:text-zinc-300">
            <div className="flex justify-between items-center">
              <span>DFW daily truck visits</span>
              <ProvenanceBadge kind="unk">unknown</ProvenanceBadge>
            </div>
            <div className="flex justify-between items-center">
              <span>Scenario visits/day</span>
              <span className="flex items-center gap-1 font-mono">
                ≈117
                <ProvenanceBadge
                  kind="drv"
                  onClick={onOpenEvidence}
                  title="Click to view derivation formula"
                >
                  derived ⓘ
                </ProvenanceBadge>
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 leading-tight">
              ITE/NAIOP high-cube study: 0.233 trip ends / 1,000 GSF × 1,000.584
              ÷ 2.
            </p>
            <div className="flex justify-between items-center">
              <span>Arrival times & service</span>
              <ProvenanceBadge kind="ill">illus→user</ProvenanceBadge>
            </div>
          </div>
        </details>

        {/* Occupancy Now */}
        <details
          open
          className="group border-t border-zinc-100 dark:border-zinc-800/60 pt-2"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold uppercase tracking-wider text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
            <span className="flex items-center gap-1">
              <span className="transition-transform group-open:rotate-90">
                ▸
              </span>
              Live Occupancy
            </span>
            {fromRun ? (
              <ProvenanceBadge kind="drv">engine</ProvenanceBadge>
            ) : (
              <ProvenanceBadge kind="ill">illustrative</ProvenanceBadge>
            )}
          </summary>
          <div className="space-y-1 text-zinc-700 dark:text-zinc-300">
            <div className="flex justify-between">
              <span>Doors occupied</span>
              <span className="font-mono font-medium">
                {counts.doorsOccupied} / {S1.dockDoors}
              </span>
            </div>
            <div className="flex justify-between text-zinc-500 dark:text-zinc-400 text-[11px]">
              <span>serving · blocked</span>
              <span className="font-mono">
                {counts.doorsServing} · {counts.doorsBlocked}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Closed · reserved</span>
              <span className="flex flex-wrap justify-end gap-x-1 font-mono">
                <DoorLinks
                  ids={closedDoors}
                  tone="text-amber-600 dark:text-amber-400"
                  onSelectEntity={onSelectEntity}
                />
                <span>·</span>
                <DoorLinks
                  ids={reservedDoors}
                  tone="text-blue-600 dark:text-blue-400"
                  onSelectEntity={onSelectEntity}
                />
              </span>
            </div>
            <div className="flex justify-between">
              <span>Stalls occupied</span>
              <span className="font-mono font-medium">
                {counts.stallsOccupied} / {S1.trailerSpaces}
              </span>
            </div>
            <div className="flex justify-between items-center text-zinc-500">
              <span>Observed DFW occupancy</span>
              <ProvenanceBadge kind="unk">unknown</ProvenanceBadge>
            </div>
          </div>
        </details>

        {/* Queues & Dependencies */}
        <details
          open
          className="group border-t border-zinc-100 dark:border-zinc-800/60 pt-2"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold uppercase tracking-wider text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
            <span className="flex items-center gap-1">
              <span className="transition-transform group-open:rotate-90">
                ▸
              </span>
              Queues & Dependencies
            </span>
            {fromRun ? (
              <ProvenanceBadge kind="drv">engine</ProvenanceBadge>
            ) : (
              <ProvenanceBadge kind="ill">illustrative</ProvenanceBadge>
            )}
          </summary>
          <div className="space-y-1 text-zinc-700 dark:text-zinc-300">
            <div className="flex justify-between">
              <span>Gate queue</span>
              <span className="font-mono">{counts.gateQueue}</span>
            </div>
            <div className="flex justify-between">
              <span>Yard waiting for door</span>
              <span className="font-mono">{counts.yardWaiting}</span>
            </div>
            <div className="flex justify-between font-medium text-amber-700 dark:text-amber-400">
              <span>Outbound blocked freight</span>
              {counts.outboundBlocked === null ? (
                <ProvenanceBadge kind="unk">unknown</ProvenanceBadge>
              ) : (
                <span className="font-mono">{counts.outboundBlocked}</span>
              )}
            </div>

            {fromRun ? (
              <p className="text-[10px] leading-tight text-zinc-500">
                The engine does not model outbound freight dependencies, so none
                are shown.
              </p>
            ) : (
              <ul className="space-y-1 border-l-2 border-amber-400/50 pl-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                {DEPENDENCIES.map((dep) => (
                  <li key={dep.door} className="leading-snug">
                    <button
                      type="button"
                      onClick={() => onSelectEntity(dep.door)}
                      className="font-mono text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {dep.door}
                    </button>{" "}
                    needs {dep.shipment} · {dep.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>

        {/* Missing DFW Evidence Register */}
        <details
          open
          className="group border-t border-zinc-100 dark:border-zinc-800/60 pt-2"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold uppercase tracking-wider text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
            <span className="flex items-center gap-1">
              <span className="transition-transform group-open:rotate-90">
                ▸
              </span>
              Missing DFW Evidence (14)
            </span>
          </summary>
          <div className="flex flex-wrap gap-1 mt-1">
            {UNKNOWN_DFW_FIELDS.map((field) => (
              <ProvenanceBadge key={field} kind="unk">
                {field}
              </ProvenanceBadge>
            ))}
          </div>
        </details>
      </div>
    </aside>
  );
};
