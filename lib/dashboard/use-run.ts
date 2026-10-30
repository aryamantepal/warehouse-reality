/**
 * Client hook over a server-owned run (plan B3). It talks only to
 * /api/runs/** (or a recorded snapshot file for replay) and never touches the
 * engine or a model directly. One request at a time; every action resolves to
 * the resulting state, so a scripted flow can await start, disrupt, then step
 * until the snapshot is done.
 */

"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type {
  CreateRunBody,
  DisruptionBody,
  StepBody,
} from "@/lib/run/api-schemas";
import type { RecordedRun } from "@/lib/run/recording";
import type { RunSnapshot } from "@/types/run";
import { type DashboardView, projectRun, type RunStatus } from "./project-run";
import { replayFromRecording } from "./replay";
import {
  createRunRequest,
  disruptRunRequest,
  type FetchFn,
  getRunRequest,
  type RunResponse,
  replayRequest,
  stepRunRequest,
} from "./run-client";
import {
  afterBusyResync,
  beginRequest,
  canStep,
  disruptionResponse,
  INITIAL_RUN_STATE,
  type RunActionResult,
  type RunRequestKind,
  type RunState,
  resultOf,
  settleRequest,
  stepResponse,
} from "./run-state";

export type { RunActionResult } from "./run-state";

export interface UseRunResult {
  view: DashboardView | null;
  /** Raw snapshot, e.g. for sceneStateFromEngine(snapshot.engine). */
  snapshot: RunSnapshot | null;
  status: RunStatus;
  /** True while any request is in flight. */
  busy: boolean;
  /** False while busy, in replay, without a live run, or once it is missing. */
  canStep: boolean;
  /** Last server error code or client message; null after a clean success. */
  error: string | null;
  start(mode: CreateRunBody["mode"]): Promise<RunActionResult>;
  /** Without maxTurns the server applies its default. */
  step(maxTurns?: StepBody["maxTurns"]): Promise<RunActionResult>;
  disrupt(body: DisruptionBody): Promise<RunActionResult>;
  replay(url: string): Promise<RunActionResult>;
  /**
   * Loads the recorded D-108 run (Nebius first, then the fallback and Claude
   * test recordings), validates it and replays it in the browser. No model
   * call, no server run.
   */
  replayRecorded(): Promise<RunActionResult>;
  /** The recording behind the current replay snapshot; null otherwise. */
  recording: RecordedRun | null;
  /** Re-reads the live run from the server, e.g. after an error. */
  refresh(): Promise<RunActionResult>;
}

const browserFetch: FetchFn = (input, init) => fetch(input, init);

type Task = (runId: string | null) => Promise<RunResponse<RunSnapshot>>;

/** beginRequest already refused run tasks without a run; this keeps types honest. */
const withRun =
  (task: (runId: string) => Promise<RunResponse<RunSnapshot>>): Task =>
  async (runId) =>
    runId ? task(runId) : { status: "error", error: "NO_RUN" };

export const useRun = (): UseRunResult => {
  const [state, setState] = useState<RunState>(INITIAL_RUN_STATE);
  // The ref is the source of truth: sequential awaits and same-tick double
  // clicks read it, not a stale render closure.
  const stateRef = useRef<RunState>(INITIAL_RUN_STATE);
  const [recording, setRecording] = useState<RecordedRun | null>(null);

  const commit = useCallback((next: RunState): RunState => {
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  const perform = useCallback(
    async (kind: RunRequestKind, task: Task): Promise<RunActionResult> => {
      const begun = beginRequest(stateRef.current, kind);
      if ("dropped" in begun) return begun.dropped;
      const { runId } = commit(begun.state);
      try {
        let res = await task(runId);
        if (res.error === "RUN_BUSY" && runId) {
          res = afterBusyResync(await getRunRequest(browserFetch, runId));
        }
        return resultOf(commit(settleRequest(stateRef.current, kind, res)));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const res = { status: "error" as const, error: message };
        return resultOf(commit(settleRequest(stateRef.current, kind, res)));
      }
    },
    [commit],
  );

  const start = useCallback(
    (mode: CreateRunBody["mode"]) =>
      perform("start", () => createRunRequest(browserFetch, mode)),
    [perform],
  );

  const step = useCallback(
    (maxTurns?: StepBody["maxTurns"]) =>
      perform(
        "step",
        withRun(async (runId) =>
          stepResponse(await stepRunRequest(browserFetch, runId, maxTurns)),
        ),
      ),
    [perform],
  );

  const disrupt = useCallback(
    (body: DisruptionBody) =>
      perform(
        "disrupt",
        withRun(async (runId) =>
          disruptionResponse(
            await disruptRunRequest(browserFetch, runId, body),
          ),
        ),
      ),
    [perform],
  );

  const replay = useCallback(
    (url: string) => perform("replay", () => replayRequest(browserFetch, url)),
    [perform],
  );

  const replayRecorded = useCallback(
    () =>
      perform("replay", async () => {
        const result = await replayFromRecording(browserFetch);
        setRecording(result.recording ?? null);
        return result.response;
      }),
    [perform],
  );

  const refresh = useCallback(
    () =>
      perform(
        "refresh",
        withRun((runId) => getRunRequest(browserFetch, runId)),
      ),
    [perform],
  );

  const view = useMemo(
    () => (state.snapshot ? projectRun(state.snapshot) : null),
    [state.snapshot],
  );

  return {
    view,
    snapshot: state.snapshot,
    status: state.status,
    busy: state.inFlight,
    canStep: canStep(state),
    error: state.error,
    start,
    step,
    disrupt,
    replay,
    replayRecorded,
    recording: state.snapshot?.mode === "replay" ? recording : null,
    refresh,
  };
};
