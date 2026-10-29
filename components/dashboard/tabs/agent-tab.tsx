"use client";

import type { AgentState } from "@/lib/agents/types";
import { callBadgeOf, provenanceOfCall } from "@/lib/dashboard/call-badge";
import type { DashboardView } from "@/lib/dashboard/project-run";
import { BudgetMeter, ModelCallBadge } from "../call-badge";
import { ProvenanceBadge } from "../provenance-badge";

interface AgentTabProps {
  /** The projected run, or null before a run exists. */
  view: DashboardView | null;
  onSelectEntity: (id: string) => void;
  onSwitchTab: (tab: "commitment") => void;
  activeAgentId: string | null;
  onSelectAgent: (id: string) => void;
}

const pickAgent = (
  agents: readonly AgentState[],
  id: string | null,
): AgentState | undefined => agents.find((a) => a.id === id) ?? agents[0];

export const AgentTab = ({
  view,
  onSelectEntity,
  onSwitchTab,
  activeAgentId,
  onSelectAgent,
}: AgentTabProps) => {
  if (!view) {
    return (
      <div className="p-3 text-xs text-zinc-500">
        No run yet. Use “Run the D-108 scenario” to start one; agents, model
        calls and commitments appear here from the server run.
      </div>
    );
  }
  const agent = pickAgent(view.agents, activeAgentId);
  const calls = view.lastCalls.filter((c) => c.agentId === agent?.id);
  const commitments = view.commitments.filter((c) =>
    c.participants.some((p) => p.agentId === agent?.id),
  );
  const s = view.provenanceSummary;

  return (
    <div className="space-y-3 p-3 text-xs">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {view.agents.map((ag) => (
          <button
            key={ag.id}
            type="button"
            onClick={() => onSelectAgent(ag.id)}
            className={`rounded px-2 py-1 font-mono text-[10px] font-medium transition-colors ${
              ag.id === agent?.id
                ? "bg-blue-600 text-white dark:bg-blue-500"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            {ag.id}
          </button>
        ))}
      </div>

      {agent && (
        <section className="rounded-md border border-zinc-200 bg-zinc-50/50 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/30">
          <div className="font-semibold text-sm">
            {agent.name} ({agent.role})
          </div>
          <div className="text-zinc-500 text-[11px]">
            Assigned entity:{" "}
            <button
              type="button"
              onClick={() => onSelectEntity(agent.assignedEntityId)}
              className="font-mono text-blue-600 dark:text-blue-400 underline"
            >
              {agent.assignedEntityId}
            </button>
            {" · "}fallbacks: {agent.fallbackCounter}
          </div>
        </section>
      )}

      <section className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Model calls for this agent
        </div>
        {calls.length > 0 ? (
          calls.map((c) => (
            <div
              key={c.id}
              className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800"
            >
              <div className="mb-1 flex justify-between font-mono text-[10px]">
                <span>
                  {c.toolName ?? "no tool"} · {c.outcome}
                  {c.reasonCode ? ` · ${c.reasonCode}` : ""}
                </span>
                <span className="text-zinc-400">v{c.stateVersion}</span>
              </div>
              <ModelCallBadge
                badge={callBadgeOf(c, provenanceOfCall(c, view.timeline))}
              />
            </div>
          ))
        ) : (
          <div className="rounded-md border border-zinc-200 p-2 italic text-zinc-400 dark:border-zinc-800">
            No recent model calls for this agent
          </div>
        )}
      </section>

      <section className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Run budget
        </div>
        <BudgetMeter budget={view.budget} />
        <p className="font-mono text-[10px] text-zinc-500">
          Turns: {s.nemotron} nemotron · {s.testModel} claude (test) ·{" "}
          {s.fallback} fallback · {s.baseline} baseline
          {s.other > 0 ? ` · ${s.other} other` : ""}
        </p>
      </section>

      <section>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Local observations & memory
        </div>
        <ul className="space-y-1 text-zinc-700 dark:text-zinc-300">
          {agent && agent.memory.length > 0 ? (
            agent.memory.slice(-4).map((m) => (
              <li key={m.id} className="flex items-baseline gap-1.5">
                <span className="font-mono text-[10px] text-zinc-400">
                  {m.type}
                </span>
                <span>{m.summary}</span>
              </li>
            ))
          ) : (
            <li className="italic text-zinc-400">No observations yet</li>
          )}
        </ul>
      </section>

      <section>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Agent inbox (offers & messages)
        </div>
        <div className="space-y-1.5">
          {agent && agent.inbox.length > 0 ? (
            agent.inbox.map((msg) => (
              <div
                key={msg.id}
                className="rounded-md border border-blue-500/50 bg-blue-50/20 p-2 dark:border-blue-500/30 dark:bg-blue-950/20"
              >
                <div className="flex items-baseline justify-between font-medium">
                  <span>
                    {msg.purpose.toUpperCase()} from {msg.fromAgentId}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400">
                    {msg.id}
                  </span>
                </div>
                <div className="mt-0.5 break-words text-zinc-700 dark:text-zinc-300">
                  {JSON.stringify(msg.payload)}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-zinc-200 p-2 italic text-zinc-400 dark:border-zinc-800">
              No pending messages in inbox
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <span>Current obligations</span>
          <ProvenanceBadge kind="drv">engine</ProvenanceBadge>
        </div>
        {commitments.length > 0 ? (
          commitments.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSwitchTab("commitment")}
              className="mb-1 w-full rounded-md border border-zinc-200 bg-zinc-50 p-2 text-left transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:bg-zinc-800"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {c.id} · {c.status}
                </span>
                <span className="font-mono text-[10px] text-zinc-400">
                  v{c.stateVersion}
                </span>
              </div>
              <div className="text-zinc-700 dark:text-zinc-300">{c.task}</div>
            </button>
          ))
        ) : (
          <div className="rounded-md border border-zinc-200 p-2 italic text-zinc-400 dark:border-zinc-800">
            No commitments involve this agent
          </div>
        )}
      </section>
    </div>
  );
};
