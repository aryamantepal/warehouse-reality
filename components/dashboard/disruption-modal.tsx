"use client";

import { useState } from "react";
import { TextureButton } from "@/components/ui/texture-button";
import {
  type ExternalSearchResult,
  externalSearchResultSchema,
  toDisruptionBody,
} from "@/lib/external/disruption-types";
import type { DisruptionBody } from "@/lib/run/api-schemas";
import { ProvenanceBadge } from "./provenance-badge";

interface DisruptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInject: (disruptionId: string) => void;
  /** Injects a search-derived hypothetical through the run API. */
  onInjectExternal: (body: DisruptionBody, label: string) => void;
}

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; result: ExternalSearchResult };

const searchExternal = async (): Promise<SearchState> => {
  try {
    const res = await fetch("/api/external/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const parsed = externalSearchResultSchema.safeParse(await res.json());
    return parsed.success
      ? { status: "done", result: parsed.data }
      : { status: "error", message: "Unexpected search response." };
  } catch {
    return { status: "error", message: "Search request failed." };
  }
};

export const DisruptionModal = ({
  isOpen,
  onClose,
  onInject,
  onInjectExternal,
}: DisruptionModalProps) => {
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  if (!isOpen) return null;

  const runSearch = async () => {
    setSearch({ status: "loading" });
    setSearch(await searchExternal());
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disruption-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-amber-500 font-bold">⚡</span>
            <h2 id="disruption-title" className="font-semibold text-sm">
              Inject Hypothetical Disruption
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Hypothetical disruptions are rehearsal interventions selected by the
          operator. They test whether autonomous operational agents detect the
          capacity conflict and negotiate feasible alternatives through the
          authoritative engine.
        </p>

        <div className="space-y-2">
          {/* H-1 */}
          <div className="rounded-md border border-amber-500/40 bg-amber-50/50 p-2.5 dark:bg-amber-950/20 text-xs">
            <div className="flex justify-between items-baseline mb-1">
              <span className="font-semibold text-amber-900 dark:text-amber-200">
                Dock Door Closure (H-1)
              </span>
              <ProvenanceBadge kind="hyp">injected</ProvenanceBadge>
            </div>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mb-2">
              Close dock door D-108. Pauses active unloading on trailer T-2291,
              forcing agents to negotiate reassignment. The engine does not
              model a closure duration.
            </p>
            <TextureButton
              variant="destructive"
              size="sm"
              onClick={() => {
                onInject("H-1");
                onClose();
              }}
            >
              Apply H-1 Disruption
            </TextureButton>
          </div>

          {/* H-2 */}
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/40 text-xs">
            <div className="flex justify-between items-baseline mb-1">
              <span className="font-semibold">Equipment Outage (H-2)</span>
              <ProvenanceBadge kind="hyp">ready</ProvenanceBadge>
            </div>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mb-2">
              Declare forklift F-07 failed. The engine marks the equipment
              failed; the cause is not modeled.
            </p>
            <TextureButton
              variant="minimal"
              size="sm"
              onClick={() => {
                onInject("H-2");
                onClose();
              }}
            >
              Apply H-2 Disruption
            </TextureButton>
          </div>

          {/* H-3 */}
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/40 text-xs">
            <div className="flex justify-between items-baseline mb-1">
              <span className="font-semibold">External Delay (H-3)</span>
              <ProvenanceBadge kind="hyp">ready</ProvenanceBadge>
            </div>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mb-2">
              Record an external delay on trailer T-2291. Recorded as an event
              only; the delay length is unknown and the engine does not apply
              it.
            </p>
            <TextureButton
              variant="minimal"
              size="sm"
              onClick={() => {
                onInject("H-3");
                onClose();
              }}
            >
              Apply H-3 Disruption
            </TextureButton>
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/40 text-xs space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="font-semibold">News scout (Tavily)</span>
              <ProvenanceBadge kind="hyp">hypothetical</ProvenanceBadge>
            </div>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
              A news hit proposes a disruption. It is not proof the facility was
              affected, and closure or delay lengths stay unknown.
            </p>
            <TextureButton
              variant="minimal"
              size="sm"
              onClick={runSearch}
              disabled={search.status === "loading"}
            >
              {search.status === "loading" ? "Searching..." : "Search news"}
            </TextureButton>
            {search.status === "error" && (
              <p className="text-[11px] text-red-700 dark:text-red-400">
                {search.message}
              </p>
            )}
            {search.status === "done" && (
              <div className="space-y-1.5">
                {search.result.source === "illustrative" ? (
                  <p className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                    Illustrative examples, not a live search.{" "}
                    {search.result.fallbackReason}
                  </p>
                ) : (
                  <p className="text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                    Live search results (external_search)
                  </p>
                )}
                {search.result.disruptions.map((item) => (
                  <div
                    key={item.id}
                    className="space-y-1 rounded border border-zinc-200 p-2 dark:border-zinc-800"
                  >
                    <div className="font-medium">{item.title}</div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      {item.suggestedAction.impactHypothesis}
                    </p>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-[11px] text-blue-700 underline dark:text-blue-300"
                      >
                        {item.url}
                      </a>
                    )}
                    <TextureButton
                      variant="minimal"
                      size="sm"
                      onClick={() => {
                        onInjectExternal(
                          toDisruptionBody(search.result.source, item),
                          item.title,
                        );
                        onClose();
                      }}
                    >
                      Inject as hypothetical
                    </TextureButton>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <TextureButton
            variant="minimal"
            size="sm"
            className="w-auto"
            onClick={onClose}
          >
            Cancel
          </TextureButton>
        </div>
      </div>
    </div>
  );
};
