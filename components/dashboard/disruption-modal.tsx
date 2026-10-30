"use client";

import { TextureButton } from "@/components/ui/texture-button";
import type { DisruptionBody } from "@/lib/run/api-schemas";
import { NewsScout } from "./news-scout";
import { ProvenanceBadge } from "./provenance-badge";

interface DisruptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInject: (body: DisruptionBody) => void;
}

interface DisruptionOption {
  body: DisruptionBody;
  title: string;
  detail: string;
}

// The run names each injection (H-1, H-2, …) in its timeline.
const OPTIONS: readonly DisruptionOption[] = [
  {
    body: { type: "dock_closure", targetId: "D-108" },
    title: "Dock door closure · D-108",
    detail:
      "Closes D-108 while T-2291 is mid-unload there (scenario values). No reopening time is modeled. The engine wakes the dock lead and driver.",
  },
  {
    body: { type: "equipment_failure", targetId: "F-07" },
    title: "Equipment failure · F-07",
    detail:
      "Forklift F-07 fails and the engine marks it failed. Agents wake only when one is assigned to the target.",
  },
];

export const DisruptionModal = ({
  isOpen,
  onClose,
  onInject,
}: DisruptionModalProps) => {
  if (!isOpen) return null;

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
              Inject a hypothetical disruption
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
          A rehearsal intervention chosen by the operator, not an observed
          event. It goes to the server run; the engine applies or refuses it,
          and the agents negotiate through engine tool calls.
        </p>

        <div className="space-y-2">
          {OPTIONS.map((o) => (
            <div
              key={`${o.body.type}-${o.body.targetId}`}
              className="rounded-md border border-amber-500/40 bg-amber-50/50 p-2.5 text-xs dark:bg-amber-950/20"
            >
              <div className="mb-1 flex items-baseline justify-between">
                <span className="font-semibold text-amber-900 dark:text-amber-200">
                  {o.title}
                </span>
                <ProvenanceBadge kind="hyp">hypothetical</ProvenanceBadge>
              </div>
              <p className="mb-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                {o.detail}
              </p>
              <TextureButton
                variant="destructive"
                size="sm"
                onClick={() => {
                  onInject(o.body);
                  onClose();
                }}
              >
                Apply
              </TextureButton>
            </div>
          ))}
        </div>

        <NewsScout
          onInject={(body) => {
            onInject(body);
            onClose();
          }}
        />

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
