"use client";

import { TextureButton } from "@/components/ui/texture-button";
import { ProvenanceBadge } from "./provenance-badge";

interface DisruptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInject: (disruptionId: string) => void;
}

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
