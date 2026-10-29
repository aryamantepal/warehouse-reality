import { describe, expect, it } from "vitest";
import type { RecordedRun } from "@/lib/run/recording";
import { loadRecording, replayLabel } from "./replay";
import type { FetchFn } from "./run-client";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

const recording = (over: Partial<RecordedRun>): RecordedRun => ({
  version: 1,
  scenarioId: "d108",
  recordedAt: "2026-10-29T18:30:00.000Z",
  models: [],
  hasModelTurns: false,
  decisions: [],
  disruptions: [],
  finalStateVersion: 0,
  events: [],
  modelCalls: [],
  finalEngine: {},
  ...over,
});

describe("replayLabel", () => {
  it("names the models and date for a model recording", () => {
    const l = replayLabel(
      recording({ hasModelTurns: true, models: ["nvidia/a", "nvidia/b"] }),
    );
    expect(l.kind).toBe("model");
    expect(l.detail).toContain("nvidia/a, nvidia/b");
    expect(l.detail).toContain("2026-10-29 18:30 UTC");
  });

  it("never calls a recording without model turns Nemotron", () => {
    const l = replayLabel(recording({ models: ["nvidia/a"] }));
    expect(l.kind).toBe("fallback");
    expect(l.title).toBe("Fallback recording");
    expect(l.detail).toContain("not Nemotron");
    expect(l.detail).not.toContain("Nebius Token Factory");
  });
});

describe("loadRecording", () => {
  it("prefers the first url that exists", async () => {
    const seen: string[] = [];
    const fetchFn: FetchFn = async (url) => {
      seen.push(url);
      return json(recording({}));
    };
    const res = await loadRecording(fetchFn, ["/a.json", "/b.json"]);
    expect(res.kind).toBe("found");
    expect(seen).toEqual(["/a.json"]);
  });

  it("falls through a 404 to the next url", async () => {
    const fetchFn: FetchFn = async (url) =>
      url === "/a.json" ? json({}, 404) : json(recording({}));
    expect((await loadRecording(fetchFn, ["/a.json", "/b.json"])).kind).toBe(
      "found",
    );
  });

  it("reports none when every url is 404", async () => {
    const fetchFn: FetchFn = async () => json({}, 404);
    expect(await loadRecording(fetchFn, ["/a.json", "/b.json"])).toEqual({
      kind: "none",
    });
  });

  it("rejects an invalid file instead of skipping to the next", async () => {
    const fetchFn: FetchFn = async (url) =>
      url === "/a.json" ? json({ version: 2 }) : json(recording({}));
    expect(await loadRecording(fetchFn, ["/a.json", "/b.json"])).toEqual({
      kind: "error",
      error: "INVALID_RECORDING",
    });
  });

  it("reports a network failure", async () => {
    const fetchFn: FetchFn = async () => {
      throw new Error("offline");
    };
    expect(await loadRecording(fetchFn, ["/a.json"])).toEqual({
      kind: "error",
      error: "offline",
    });
  });
});
