"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SceneStatus } from "@/components/scene/facility-scene";
import { SceneLoader } from "@/components/scene/scene-loader";
import { TextureButton } from "@/components/ui/texture-button";
import {
  calculateDashboardCounts,
  TIMELINE_EVENTS,
  UNKNOWN_DFW_FIELDS,
} from "@/lib/dashboard/data";
import { failureOf, type GuidedApi } from "@/lib/dashboard/guided-demo";
import { callsWithoutUsage } from "@/lib/dashboard/model-call-format";
import { NO_RECORDING } from "@/lib/dashboard/replay";
import { useRun } from "@/lib/dashboard/use-run";
import type { DisruptionBody } from "@/lib/run/api-schemas";
import { keepSameScene, sceneStateFromEngine } from "@/lib/scene/from-engine";
import { ILLUSTRATIVE_STATE } from "@/lib/scene/illustrative-state";
import type { SceneState } from "@/lib/scene/types";
import { DEFAULT_VIEW, type ViewSettings } from "@/lib/scene/view-settings";
import type { TabKey } from "@/types/dashboard";
import { BudgetMeter } from "./budget-meter";
import { CausalTimeline } from "./causal-timeline";
import { ComparePanel } from "./compare-panel";
import { DisruptionModal } from "./disruption-modal";
import { FacilityPanel } from "./facility-panel";
import { GuidedDemo } from "./guided-demo";
import { InspectorPanel } from "./inspector-panel";
import { ReplayBanner } from "./replay-banner";
import { SettingsPane } from "./settings-pane";
import { TopBar, ViewMenu } from "./top-bar";

/** Shown only before a run exists, and labelled illustrative wherever it appears. */
const ILLUSTRATIVE_COUNTS = calculateDashboardCounts();

const TOAST_MS = 3500;

export const DashboardLayout = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("agent");
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [disruptionModalOpen, setDisruptionModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [view, setView] = useState<ViewSettings>(DEFAULT_VIEW);
  const [followId, setFollowId] = useState<string | null>(null);
  const [homeSignal, setHomeSignal] = useState(0);
  // Display pacing only: they change how the ambient motion plays, never the run.
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState<1 | 4 | 16>(4);
  const [guidedRunning, setGuidedRunning] = useState(false);
  const [sceneStatus, setSceneStatus] = useState<SceneStatus>({
    meshes: "loading",
    canFollow: false,
    graphicsLost: false,
  });

  // The server-owned run is the only source of run state.
  const run = useRun();
  const { snapshot, view: runView, recording } = run;
  const { disrupt: runDisrupt, start: runStart, replayRecorded } = run;
  // Disruptions applied to the current run, replayed onto the baseline (B7).
  const [applied, setApplied] = useState<DisruptionBody[]>([]);
  const trackedDisrupt = useCallback(
    async (body: DisruptionBody) => {
      const r = await runDisrupt(body);
      if (!failureOf(r)) setApplied((prev) => [...prev, body]);
      return r;
    },
    [runDisrupt],
  );
  const trackedStart = useCallback(
    (mode: Parameters<typeof runStart>[0]) => {
      setApplied([]);
      return runStart(mode);
    },
    [runStart],
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
  // A run update that moved nothing keeps the same scene object, so the camera,
  // layout and ambient motion are not rebuilt on every step.
  const lastScene = useRef<SceneState | undefined>(undefined);
  const runScene = useMemo(() => {
    if (!snapshot) return undefined;
    const next = keepSameScene(
      lastScene.current,
      sceneStateFromEngine(snapshot.engine),
    );
    lastScene.current = next;
    return next;
  }, [snapshot]);
  const shownScene = runScene ?? ILLUSTRATIVE_STATE;
  const facilityRun = useMemo(
    () =>
      snapshot
        ? {
            runId: snapshot.runId,
            mode: snapshot.mode,
            stateVersion: snapshot.stateVersion,
          }
        : null,
    [snapshot],
  );
  const canStep = run.canStep && !guidedRunning;

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, TOAST_MS);
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

  const handleStep = useCallback(async () => {
    const r = await run.step();
    const failure = failureOf(r);
    showToast(
      failure
        ? `Step failed: ${failure}`
        : `Stepped · run ${r.snapshot?.status ?? "unknown"}`,
    );
  }, [run.step, showToast]);

  const handleInjectDisruption = useCallback(
    async (body: DisruptionBody) => {
      const r = await trackedDisrupt(body);
      const failure = failureOf(r);
      if (failure) {
        showToast(`Disruption failed: ${failure}`);
        return;
      }
      showToast(`Injected ${body.type} on ${body.targetId} into the run`);
      handleSelectEntity(body.targetId);
    },
    [trackedDisrupt, handleSelectEntity, showToast],
  );

  // The guided flow uses the hook's actions; a successful closure selects the door.
  const guidedApi = useMemo<GuidedApi>(
    () => ({
      start: trackedStart,
      step: run.step,
      disrupt: async (body) => {
        const r = await trackedDisrupt(body);
        if (!failureOf(r)) setSelectedId(body.targetId);
        return r;
      },
    }),
    [trackedStart, run.step, trackedDisrupt],
  );

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-zinc-100 font-sans text-zinc-950 antialiased select-none dark:bg-zinc-950 dark:text-zinc-50">
      {/* The 3D scene fills the window; everything else floats over it. */}
      <section className="absolute inset-0">
        <SceneLoader
          selectedId={selectedId}
          onSelectEntity={handleSelectEntity}
          state={runScene}
          speed={speed}
          paused={isPaused}
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
      />

      {/* Drawers sit below the top row at whatever height it wraps or expands to. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 bottom-16 z-20 flex flex-col gap-2">
        <div className="flex flex-wrap items-start gap-2">
          <TopBar
            logicalTime={runView?.clock ?? null}
            runStatus={run.status}
            isPaused={isPaused}
            speed={speed}
            busy={run.busy || guidedRunning}
            canStep={canStep}
            onTogglePause={() => setIsPaused((p) => !p)}
            onStep={handleStep}
            onChangeSpeed={setSpeed}
            onOpenDisruptionModal={() => setDisruptionModalOpen(true)}
          />
          <GuidedDemo
            run={guidedApi}
            busy={run.busy && !guidedRunning}
            onRunningChange={setGuidedRunning}
          >
            {runView && snapshot && (
              <BudgetMeter
                budget={runView.budget}
                unreportedCalls={callsWithoutUsage(
                  runView,
                  snapshot.modelCalls,
                )}
                compact
              />
            )}
            {run.status === "missing" && !guidedRunning && (
              <span className="text-red-700 dark:text-red-400">
                RUN_NOT_FOUND: run not found on the server; run the scenario
                again or watch the recording.
              </span>
            )}
          </GuidedDemo>
          <TextureButton
            variant="minimal"
            size="sm"
            className="pointer-events-auto w-auto"
            disabled={run.busy || guidedRunning}
            onClick={() => void replayRecorded()}
          >
            Watch recorded run
          </TextureButton>
          <CausalTimeline
            events={runView?.timeline ?? TIMELINE_EVENTS}
            runId={snapshot?.runId ?? null}
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

        {run.error === NO_RECORDING && (
          <output className="pointer-events-auto block rounded-lg border border-zinc-400/60 bg-zinc-50/95 px-3 py-1.5 text-xs text-zinc-900 shadow-sm dark:bg-zinc-900/90 dark:text-zinc-200">
            No recording yet: no recorded run has been published with this
            build. Start a live run instead.
          </output>
        )}
        {recording && <ReplayBanner recording={recording} />}
        <ComparePanel
          agentsSnapshot={snapshot}
          disruptions={compareDisruptions}
        />

        <div className="relative min-h-0 flex-1">
          <FacilityPanel
            isOpen={leftOpen}
            counts={runView?.counts ?? ILLUSTRATIVE_COUNTS}
            run={facilityRun}
            scene={shownScene}
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
            calls={snapshot?.modelCalls ?? []}
            scene={shownScene}
            activeAgentId={activeAgentId}
            onSelectAgent={setActiveAgentId}
          />
        </div>
      </div>
    </div>
  );
};
