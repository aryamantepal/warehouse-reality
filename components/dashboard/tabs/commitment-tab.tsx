"use client";

import { formatClock } from "@/lib/dashboard/project-run";
import type { CommitmentEntity } from "@/lib/engine/types";
import { ProvenanceBadge } from "../provenance-badge";

interface CommitmentTabProps {
  commitments: readonly CommitmentEntity[];
  onSelectEntity: (id: string) => void;
}

const STATUS_STYLE: Partial<Record<CommitmentEntity["status"], string>> = {
  committed: "text-emerald-700 dark:text-emerald-400",
  executing: "text-emerald-700 dark:text-emerald-400",
  completed: "text-emerald-700 dark:text-emerald-400",
  rejected: "text-red-700 dark:text-red-400",
  cancelled: "text-red-700 dark:text-red-400",
};

const CommitmentCard = ({
  commitment: c,
  onSelectEntity,
}: {
  commitment: CommitmentEntity;
  onSelectEntity: (id: string) => void;
}) => (
  <section className="space-y-2 rounded-md border border-zinc-200 p-2.5 dark:border-zinc-800">
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold">Commitment {c.id}</span>
      <span
        className={`font-mono text-[11px] font-medium ${STATUS_STYLE[c.status] ?? "text-blue-600 dark:text-blue-400"}`}
      >
        {c.status}
      </span>
    </div>
    <div className="text-[11px] text-zinc-500">
      engine v{c.stateVersion} · created {formatClock(c.createdAt)} · expires{" "}
      {formatClock(c.expiresAt)}
      {c.committedAt !== undefined
        ? ` · committed ${formatClock(c.committedAt)}`
        : ""}
    </div>
    <p className="text-zinc-800 dark:text-zinc-200">{c.task}</p>
    {c.rejectionReason && (
      <p className="font-mono text-[11px] text-red-700 dark:text-red-400">
        {c.rejectionReason}
      </p>
    )}
    <table className="w-full overflow-hidden rounded-md border border-zinc-200 text-xs dark:border-zinc-800">
      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {c.participants.map((p) => (
          <tr key={p.agentId}>
            <td className="px-2 py-1 font-mono font-medium">{p.agentId}</td>
            <td className="px-2 py-1 text-zinc-500">{p.role}</td>
            <td
              className={`px-2 py-1 ${p.accepted ? "text-emerald-600" : "text-zinc-400"}`}
            >
              {p.accepted ? "accepted" : "pending"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    {c.requiredResources.length > 0 && (
      <table className="w-full overflow-hidden rounded-md border border-zinc-200 text-xs dark:border-zinc-800">
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {c.requiredResources.map((r) => (
            <tr key={`${r.resourceId}-${r.startWindow}`}>
              <td className="px-2 py-1 font-mono">
                <button
                  type="button"
                  onClick={() => onSelectEntity(r.resourceId)}
                  className="font-mono text-blue-600 underline"
                >
                  {r.resourceId}
                </button>
              </td>
              <td className="px-2 py-1 font-mono text-zinc-500">
                {formatClock(r.startWindow)}–{formatClock(r.endWindow)}
              </td>
              <td className="px-2 py-1 text-zinc-500">{r.type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </section>
);

export const CommitmentTab = ({
  commitments,
  onSelectEntity,
}: CommitmentTabProps) => (
  <div className="space-y-3 p-3 text-xs">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        Engine commitments ({commitments.length})
      </span>
      <ProvenanceBadge kind="drv">engine</ProvenanceBadge>
    </div>
    {commitments.length === 0 ? (
      <div className="rounded-md border border-zinc-200 p-2 italic text-zinc-400 dark:border-zinc-800">
        No commitments yet. Rejected tool calls appear in the timeline with
        their reason code.
      </div>
    ) : (
      commitments.map((c) => (
        <CommitmentCard
          key={c.id}
          commitment={c}
          onSelectEntity={onSelectEntity}
        />
      ))
    )}
  </div>
);
