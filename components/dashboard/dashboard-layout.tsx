"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SceneStatus } from "@/components/scene/facility-scene";
import { SceneLoader } from "@/components/scene/scene-loader";
import { TextureButton } from "@/components/ui/texture-button";
import {
  calculateDashboardCounts,
  doorIdsWithStatus,
  UNKNOWN_DFW_FIELDS,
} from "@/lib/dashboard/data";
import type { GuidedActions } from "@/lib/dashboard/guided-demo";
import { useRun } from "@/lib/dashboard/use-run";
import type { DisruptionBody } from "@/lib/run/api-schemas";
import { sceneStateFromEngine } from "@/lib/scene/from-engine";
import { ILLUSTRATIVE_STATE } from "@/lib/scene/illustrative-state";
import { DEFAULT_VIEW, type ViewSettings } from "@/lib/scene/view-settings";
import type { TabKey } from "@/types/dashboard";
import { CausalTimeline } from "./causal-timeline";
import { ComparePanel } from "./compare-panel";
import { DisruptionModal } from "./disruption-modal";
import { FacilityPanel } from "./facility-panel";
import { GuidedDemo } from "./guided-demo";
import { InspectorPanel } from "./inspector-panel";
import { ReplayBanner } from "./replay-banner";
import { RunNotice } from "./run-notice";
import { SettingsPane } from "./settings-pane";
import { TopBar, ViewMenu } from "./top-bar";

/** Modal disruption ids -> run API bodies. Only the operator API injects. */
const DISRUPTIONS: Readonly<Record<string, DisruptionBody>> = {
  "H-1": { type: "dock_closure", targetId: "D-108" },
  "H-2": { type: "equipment_failure", targetId: "F-07" },
  "H-3": { type: "external_delay", targetId: "T-2291" },
};

export const DashboardLayout = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("agent");
  const [disruptionModalOpen, setDisruptionModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [view, setView] = useState<ViewSettings>(DEFAULT_VIEW);
  const [followId, setFollowId] = useState<string | null>(null);
  const [homeSignal, setHomeSignal] = useState(0);
  const [sceneStatus, setSceneStatus] = useState<SceneStatus>({
    meshes: "loading",
    canFollow: false,
    graphicsLost: false,
  });

  const [speed, setSpeed] = useState<1 | 4 | 16>(4);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);

  // The server-owned run: panels, timeline, inspector and scene all read it.
  const {
    view: runView,
    snapshot,
    status,
    busy,
    canStep,
    error,
    start,
    step,
    disrupt,
    refresh,
    replayRecorded,
    recording,
  } = useRun();

  // Disruptions applied to the current run, replayed onto the baseline (B7).
  const [applied, setApplied] = useState<DisruptionBody[]>([]);
  const trackedDisrupt = useCallback(
    async (body: DisruptionBody) => {
      const result = await disrupt(body);
      if (!result.error) setApplied((prev) => [...prev, body]);
      return result;
    },
    [disrupt],
  );
  const trackedStart = useCallback(
    async (mode: "live" | "baseline") => {
      setApplied([]);
      return start(mode);
    },
    [start],
  );
  const compareDisruptions = recording
    ? recording.disruptions.map((d) => d.body)
    : applied;

  // ?replay=d108 opens the recorded run directly: the hosted-demo entry point.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("replay") === "d108") {
      void replayRecorded();
    }
  }, [replayRecorded]);

  // The illustrative state only when there is no run (plan B4).
  const sceneState = useMemo(
    () =>
      snapshot ? sceneStateFromEngine(snapshot.engine) : ILLUSTRATIVE_STATE,
    [snapshot],
  );
  const counts = runView?.counts ?? calculateDashboardCounts();
  const closedDoors = useMemo(
    () => doorIdsWithStatus(sceneState, "closed"),
    [sceneState],
  );
  const reservedDoors = useMemo(
    () => doorIdsWithStatus(sceneState, "reserved"),
    [sceneState],
  );

  const guidedActions = useMemo<GuidedActions>(
    () => ({
      start: () => trackedStart("live"),
      disrupt: trackedDisrupt,
      step,
    }),
    [trackedStart, trackedDisrupt, step],
  );

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3500);
  }, []);

  const handleSelectEntity = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) {
      setRightOpen(true);
    }
  }, []);

  const handleOpenEvidence = useCallback(() => {
    setRightOpen(true);
    setActiveTab("evidence");
  }, []);

  const handleInjectDisruption = useCallback(
    async (disruptionId: string) => {
      const body = DISRUPTIONS[disruptionId];
      if (!body) return;
      const result = await trackedDisrupt(body);
      showToast(
        result.error
          ? `Disruption ${disruptionId} not applied: ${result.error}`
          : `Injected ${disruptionId} (${body.type} on ${body.targetId}) into the run`,
      );
      if (!result.error) handleSelectEntity(body.targetId);
    },
    [trackedDisrupt, handleSelectEntity, showToast],
  );

  const handleInjectExternal = useCallback(
    async (body: DisruptionBody, label: string) => {
      const result = await trackedDisrupt(body);
      showToast(
        result.error
          ? `Hypothetical not applied: ${result.error}`
          : `Injected hypothetical "${label}" (${body.type} on ${body.targetId})`,
      );
      if (!result.error) handleSelectEntity(body.targetId);
    },
    [trackedDisrupt, handleSelectEntity, showToast],
  );

  const handleStep = useCallback(async () => {
    const result = await step();
    if (result.error) showToast(`Step failed: ${result.error}`);
  }, [step, showToast]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-zinc-100 font-sans text-zinc-950 antialiased select-none dark:bg-zinc-950 dark:text-zinc-50">
      {/* The 3D scene fills the window; everything else floats over it. */}
      <section className="absolute inset-0">
        <SceneLoader
          state={sceneState}
          selectedId={selectedId}
          onSelectEntity={handleSelectEntity}
          speed={speed}
          view={view}
          followId={followId}
          onFollow={setFollowId}
          homeSignal={homeSignal}
          onStatus={setSceneStatus}
        />
      </section>

      {toastMessage && (
        <output
          aria-live="polite"
          className="fixed top-16 left-1/2 z-50 -translate-x-1/2 rounded-md bg-zinc-900/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-xs transition-all dark:bg-zinc-100/90 dark:text-zinc-900"
        >
          {toastMessage}
        </output>
      )}

      <DisruptionModal
        isOpen={disruptionModalOpen}
        onClose={() => setDisruptionModalOpen(false)}
        onInject={handleInjectDisruption}
        onInjectExternal={handleInjectExternal}
      />

      {/* Drawers sit below the top row at whatever height it wraps or expands to. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 bottom-16 z-20 flex flex-col gap-2">
        <div className="flex flex-wrap items-start gap-2">
          <TopBar
            logicalTime={runView?.clock ?? null}
            busy={busy}
            canStep={canStep}
            speed={speed}
            onStep={handleStep}
            onChangeSpeed={setSpeed}
            onOpenDisruptionModal={() => setDisruptionModalOpen(true)}
          />
          <GuidedDemo actions={guidedActions} busy={busy} />
          <TextureButton
            variant="minimal"
            size="sm"
            className="pointer-events-auto w-auto"
            disabled={busy}
            onClick={() => void replayRecorded()}
          >
            Watch recorded run
          </TextureButton>
          <CausalTimeline
            {...(runView
              ? { events: runView.timeline, calls: snapshot?.modelCalls }
              : {})}
            fromRun={runView !== null}
          />
          <ViewMenu
            facilityOpen={leftOpen}
            inspectorOpen={rightOpen}
            unknownCount={UNKNOWN_DFW_FIELDS.length}
            onToggleFacility={() => setLeftOpen((o) => !o)}
            onToggleInspector={() => setRightOpen((o) => !o)}
            onOpenEvidence={handleOpenEvidence}
            settings={
              <SettingsPane
                view={view}
                meshes={sceneStatus.meshes}
                canFollow={sceneStatus.canFollow}
                graphicsLost={sceneStatus.graphicsLost}
                following={followId !== null}
                onChange={setView}
                onResetView={() => {
                  setFollowId(null);
                  setHomeSignal((n) => n + 1);
                }}
                onToggleFollow={() => {
                  if (followId) {
                    setFollowId(null);
                    setHomeSignal((n) => n + 1);
                  } else if (selectedId) {
                    setFollowId(selectedId);
                  }
                }}
              />
            }
          />
        </div>

        <RunNotice
          status={status}
          error={error}
          busy={busy}
          onStartNew={() => trackedStart("live")}
          onRetry={refresh}
          onWatchRecording={() => void replayRecorded()}
        />
        {recording && <ReplayBanner recording={recording} />}
        <ComparePanel
          agentsSnapshot={snapshot}
          disruptions={compareDisruptions}
        />

        <div className="relative min-h-0 flex-1">
          <FacilityPanel
            isOpen={leftOpen}
            counts={counts}
            fromRun={runView !== null}
            stateVersion={snapshot?.stateVersion ?? null}
            closedDoors={closedDoors}
            reservedDoors={reservedDoors}
            onToggle={() => setLeftOpen((o) => !o)}
            onSelectEntity={handleSelectEntity}
            onOpenEvidence={handleOpenEvidence}
          />

          <InspectorPanel
            isOpen={rightOpen}
            activeTab={activeTab}
            selectedId={selectedId}
            onToggle={() => setRightOpen((o) => !o)}
            onSelectTab={setActiveTab}
            onSelectEntity={handleSelectEntity}
            view={runView}
            sceneState={sceneState}
            activeAgentId={activeAgentId}
            onSelectAgent={setActiveAgentId}
          />
        </div>
      </div>
    </div>
  );
};
