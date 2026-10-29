"use client";

import type { DashboardView } from "@/lib/dashboard/project-run";
import type { SceneState } from "@/lib/scene/types";
import type { TabKey } from "@/types/dashboard";
import { AgentTab } from "./tabs/agent-tab";
import { CommitmentTab } from "./tabs/commitment-tab";
import { EntitiesTab } from "./tabs/entities-tab";
import { EvidenceTab } from "./tabs/evidence-tab";

interface InspectorPanelProps {
  isOpen: boolean;
  activeTab: TabKey;
  selectedId: string | null;
  onToggle: () => void;
  onSelectTab: (tab: TabKey) => void;
  onSelectEntity: (id: string) => void;
  /** The projected run, or null before a run exists. */
  view: DashboardView | null;
  sceneState: SceneState;
  activeAgentId: string | null;
  onSelectAgent: (id: string) => void;
}

export const InspectorPanel = ({
  isOpen,
  activeTab,
  selectedId,
  onToggle,
  onSelectTab,
  onSelectEntity,
  view,
  sceneState,
  activeAgentId,
  onSelectAgent,
}: InspectorPanelProps) => {
  if (!isOpen) return null;

  return (
    <aside
      aria-label="Inspector"
      className="pointer-events-auto absolute inset-y-0 right-0 flex w-80 max-w-full flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white/95 shadow-lg backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95"
    >
      {/* Tab Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20">
        <div role="tablist" className="flex flex-1 text-xs">
          {(
            [
              { key: "agent", label: "Agent" },
              { key: "commitment", label: "Commitment" },
              { key: "evidence", label: "Evidence" },
              { key: "entities", label: "Entities" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => onSelectTab(key)}
              className={`px-3 py-2 font-medium transition-colors border-b-2 ${
                activeTab === key
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="mr-2 grid size-6 place-items-center rounded text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Close inspector panel"
        >
          ✕
        </button>
      </div>

      {/* Tab Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === "agent" && (
          <AgentTab
            view={view}
            onSelectEntity={onSelectEntity}
            onSwitchTab={() => onSelectTab("commitment")}
            activeAgentId={activeAgentId}
            onSelectAgent={onSelectAgent}
          />
        )}
        {activeTab === "commitment" && (
          <CommitmentTab
            commitments={view?.commitments ?? []}
            onSelectEntity={onSelectEntity}
          />
        )}
        {activeTab === "evidence" && <EvidenceTab />}
        {activeTab === "entities" && (
          <EntitiesTab
            selectedId={selectedId}
            onSelectEntity={onSelectEntity}
            sceneState={sceneState}
          />
        )}
      </div>
    </aside>
  );
};
