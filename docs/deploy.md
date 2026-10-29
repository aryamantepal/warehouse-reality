# Deploy checklist

Status: prepared, not deployed. Nothing here has been run against a hosted target.

## How the hosted demo behaves

- The run registry (`lib/run/registry.ts`) is in memory, per process. A restart, a redeploy or a second serverless instance loses runs, and `/api/runs/:id` answers 404 `RUN_NOT_FOUND`. The UI then offers "Start new run" or "Watch recorded run".
- So the live flow needs **one long-lived container, one instance** (plan B8 step 2). Do not use per-request serverless functions for live runs: create and step can land on different instances.
- Replay is the safe default for judges: `/?replay=d108` (or the "Watch recorded run" button) fetches `/runs/d108-nebius.json`, falls back to `/runs/d108-fallback.json`, validates it with `RecordedRunSchema` and replays it in the browser. No key, no model call, no server run. It works on any static host and on a multi-instance deploy.
- If neither recording file is deployed, the UI says "No recording yet" instead of inventing one.
- A `d108-fallback.json` recording has no model turns. The banner labels it "Fallback recording ... not Nemotron". Never present it as Nebius output.

## Environment variables (server only)

| Var | Needed | Notes |
| --- | --- | --- |
| `NEBIUS_API_KEY` | live runs only | Server-side secret. Never prefix with `NEXT_PUBLIC_`. Blank means every turn is a labeled fallback. |
| `NEBIUS_BASE_URL`, `NEBIUS_MODEL`, `NEBIUS_MODEL_NANO/SUPER/ULTRA` | optional | Defaults in `.env.example`. |
| `TAVILY_API_KEY` | optional | Blank returns illustrative fixtures. |

Set them in the host's secret store, not in the image. `.env` and `.env.local` stay uncommitted.

## Steps

1. On the freeze branch, `pnpm install --frozen-lockfile && pnpm check && pnpm build` must be green.
2. Record against the real key: put `NEBIUS_API_KEY` in `.env.local`, `pnpm dev`, then `node scripts/record-run.ts --base http://localhost:3000`. Confirm the script prints Nemotron model ids and no "NOT a Nemotron recording" warning. It writes `public/runs/d108-nebius.json`. Commit that file (plan B9 step 1, Person A).
3. Build the image: `docker build -t warehouse-sim .` and smoke test with `docker run -p 3000:3000 -e NEBIUS_API_KEY=... warehouse-sim`.
4. Deploy as a single long-lived instance. First choice: a Nebius Serverless Endpoint (check current Nebius docs for container deploy). Fallback: any single-instance container host. Pin min and max instances to 1. Set the env vars above.
5. From a fresh browser profile:
   - `<url>/?replay=d108` shows the recording banner with `recordedAt` and the model ids, with no key set.
   - The live "Run the D-108 scenario" flow completes on the hosted URL.
   - `curl -s <url>/api/runs/does-not-exist` returns 404 `{"error":"RUN_NOT_FOUND"}`.
6. Put the hosted URL and the `?replay=d108` URL in `README.md` (B9).

## Remaining for the actual deploy

- A real `public/runs/d108-nebius.json` (none is committed yet).
- Choosing and provisioning the host, and setting its secrets.
- Running step 5 against the hosted URL.
