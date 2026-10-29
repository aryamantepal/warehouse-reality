/**
 * Client-side replay of a recorded run (plan B8). The recording is fetched as a
 * static file, validated with RecordedRunSchema, and replayed through a fresh
 * in-browser Run via ReplayDeliberator: no model call, no server run.
 */

import {
  type RecordedRun,
  RecordedRunSchema,
  replayRun,
} from "@/lib/run/recording";
import type { RunSnapshot } from "@/types/run";
import type { FetchFn, RunResponse } from "./run-client";

/** Preferred first: a genuine Nebius recording, then the labeled fallback one. */
export const RECORDING_URLS: readonly string[] = [
  "/runs/d108-nebius.json",
  "/runs/d108-fallback.json",
];

export const NO_RECORDING = "NO_RECORDING";

export type RecordingLoad =
  | { kind: "found"; recording: RecordedRun }
  | { kind: "none" }
  | { kind: "error"; error: string };

/** Tries each URL in order; only a 404 moves on. A bad file is an error, never skipped. */
export const loadRecording = async (
  fetchFn: FetchFn,
  urls: readonly string[] = RECORDING_URLS,
): Promise<RecordingLoad> => {
  for (const url of urls) {
    let res: Response;
    try {
      res = await fetchFn(url, { method: "GET" });
    } catch (error) {
      return {
        kind: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (res.status === 404) continue;
    if (!res.ok) return { kind: "error", error: `HTTP_${res.status}` };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { kind: "error", error: "INVALID_RECORDING" };
    }
    const parsed = RecordedRunSchema.safeParse(body);
    return parsed.success
      ? { kind: "found", recording: parsed.data }
      : { kind: "error", error: "INVALID_RECORDING" };
  }
  return { kind: "none" };
};

export interface ReplayLabel {
  /** "model" only when at least one turn was genuinely answered by a model. */
  kind: "model" | "fallback";
  title: string;
  detail: string;
}

const formatDate = (iso: string): string =>
  `${iso.slice(0, 16).replace("T", " ")} UTC`;

/** Banner wording. A recording with no model turns is never called Nemotron. */
export const replayLabel = (r: RecordedRun): ReplayLabel => {
  const when = formatDate(r.recordedAt);
  if (r.hasModelTurns) {
    return {
      kind: "model",
      title: "Recorded run",
      detail: `Recorded on Nebius Token Factory, models: ${r.models.join(", ")}, ${when}. Replay makes no model calls.`,
    };
  }
  return {
    kind: "fallback",
    title: "Fallback recording",
    detail: `No model answered this recording; every turn is the scripted fallback (not Nemotron). Recorded ${when}. Replay makes no model calls.`,
  };
};

export interface ReplayResult {
  response: RunResponse<RunSnapshot>;
  recording?: RecordedRun;
}

/** Loads and replays; the returned snapshot has mode "replay". */
export const replayFromRecording = async (
  fetchFn: FetchFn,
  urls?: readonly string[],
): Promise<ReplayResult> => {
  const loaded = await loadRecording(fetchFn, urls);
  if (loaded.kind === "none") {
    return { response: { status: "error", error: NO_RECORDING } };
  }
  if (loaded.kind === "error") {
    return { response: { status: "error", error: loaded.error } };
  }
  try {
    const run = await replayRun(loaded.recording);
    return {
      response: { status: "ready", data: run.snapshot() },
      recording: loaded.recording,
    };
  } catch (error) {
    return {
      response: {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
};
