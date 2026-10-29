"use client";

import { useMemo, useState } from "react";
import { getEntitiesForFilter } from "@/lib/dashboard/data";
import { statusText } from "@/lib/scene/status-text";
import type { SceneState } from "@/lib/scene/types";
import type { EntityFilter } from "@/types/dashboard";

interface EntitiesTabProps {
  selectedId: string | null;
  onSelectEntity: (id: string) => void;
  sceneState: SceneState;
}

const FILTER_LABELS: Record<EntityFilter, string> = {
  doors: "Doors",
  stalls: "Stalls",
  trailers: "Trailers",
  equipment: "Equipment",
};

export const EntitiesTab = ({
  selectedId,
  onSelectEntity,
  sceneState,
}: EntitiesTabProps) => {
  const [filter, setFilter] = useState<EntityFilter>("doors");

  const entities = useMemo(
    () => getEntitiesForFilter(filter, sceneState),
    [filter, sceneState],
  );

  return (
    <div className="flex h-full flex-col p-3 text-xs gap-2">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["doors", "stalls", "trailers", "equipment"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                filter === f
                  ? "bg-zinc-200 text-zinc-950 dark:bg-zinc-700 dark:text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-zinc-400 font-mono">
          {entities.length} items
        </span>
      </div>

      <div className="flex-1 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-700">
            <tr>
              <th className="px-2.5 py-1.5 font-medium w-24">ID</th>
              <th className="px-2.5 py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono">
            {entities.map((e) => {
              const isSelected = e.id === selectedId;
              return (
                <tr
                  key={e.id}
                  className={`transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${
                    isSelected
                      ? "bg-blue-500/15 text-blue-900 dark:text-blue-100 font-medium"
                      : "text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <td className="px-2.5 py-1">
                    <button
                      type="button"
                      onClick={() => onSelectEntity(e.id)}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-mono"
                    >
                      {e.id}
                    </button>
                  </td>
                  <td className="px-2.5 py-1 font-sans text-xs">
                    {statusText(e)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
