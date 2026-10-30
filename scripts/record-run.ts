/**
 * Records a live D-108 run (plan Task A9): POST create, disrupt D-108, step
 * until done, GET export, validate, write.
 *
 * Start the dev server first (with NEBIUS_API_KEY in .env.local for a real
 * Nemotron run), then:
 *   node scripts/record-run.ts [--base http://localhost:3000] [--out path]
 *
 * With no key on the server every turn is a labeled fallback; the script says
 * so and writes public/runs/d108-fallback.json instead of d108-nebius.json.
 * With only ANTHROPIC_API_KEY set, turns are answered by a Claude TEST model:
 * the script writes public/runs/d108-test-model.json with a loud warning.
 * Only real Nemotron turns may produce d108-nebius.json.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import {
  isTestRecording,
  RecordedRunSchema,
} from "../lib/run/recording-schema.ts";

const MAX_STEP_ROUNDS = 40;
const STEP_TURNS = 4;
const REQUEST_TIMEOUT_MS = 5 * 60_000;
const NEBIUS_OUT = "public/runs/d108-nebius.json";
const TEST_OUT = "public/runs/d108-test-model.json";
const FALLBACK_OUT = "public/runs/d108-fallback.json";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:3000" },
    out: { type: "string" },
  },
});
const base = (values.base ?? "http://localhost:3000").replace(/\/$/, "");

const call = async (
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<unknown> => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
};

const statusOf = (value: unknown): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const snap = "snapshot" in value ? value.snapshot : value;
  if (typeof snap !== "object" || snap === null || !("status" in snap)) {
    return undefined;
  }
  return typeof snap.status === "string" ? snap.status : undefined;
};

const main = async (): Promise<void> => {
  const created = await call("POST", "/api/runs", {
    scenarioId: "d108",
    mode: "live",
  });
  const runId =
    typeof created === "object" && created !== null && "runId" in created
      ? String(created.runId)
      : undefined;
  if (!runId) throw new Error("create response had no runId");
  console.log(`created run ${runId}`);

  await call("POST", `/api/runs/${runId}/disruptions`, {
    type: "dock_closure",
    targetId: "D-108",
  });
  console.log("injected dock_closure on D-108");

  let status: string | undefined;
  for (let round = 1; round <= MAX_STEP_ROUNDS; round++) {
    const result = await call("POST", `/api/runs/${runId}/step`, {
      maxTurns: STEP_TURNS,
    });
    status = statusOf(result);
    console.log(`step round ${round}: ${status}`);
    if (status === "done") break;
  }
  if (status !== "done") {
    throw new Error(`run did not finish in ${MAX_STEP_ROUNDS} rounds`);
  }

  const recording = RecordedRunSchema.parse(
    await call("GET", `/api/runs/${runId}/export`),
  );
  const fallbacks = recording.modelCalls.filter((c) => c.isFallback).length;
  const testModel = isTestRecording(recording);
  const out =
    values.out ??
    (testModel
      ? TEST_OUT
      : recording.hasModelTurns
        ? NEBIUS_OUT
        : FALLBACK_OUT);

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(recording, null, 2)}\n`);
  console.log(
    `wrote ${out}: ${recording.decisions.length} decisions, ` +
      `${recording.modelCalls.length} model calls (${fallbacks} fallback)`,
  );
  console.log(`models: ${recording.models.join(", ") || "none"}`);

  if (testModel) {
    console.warn(
      "\n############################################################\n" +
        "WARNING: this is NOT a Nemotron recording. Turns were answered by a\n" +
        `Claude TEST model (${recording.models.join(", ")}) via ANTHROPIC_API_KEY.\n` +
        "Never present it as Nebius Token Factory / NVIDIA output.\n" +
        "############################################################",
    );
  } else if (!recording.hasModelTurns) {
    console.warn(
      "\nWARNING: this is NOT a Nemotron recording. No turn was answered by a " +
        "model (NEBIUS_API_KEY missing on the server, or every call fell " +
        "back). All turns are labeled fallback. Do not present it as Nebius " +
        "Token Factory output.",
    );
  } else if (fallbacks > 0) {
    console.warn(
      `\nWARNING: ${fallbacks} of ${recording.modelCalls.length} turns are ` +
        "labeled fallback and were not answered by Nemotron.",
    );
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
