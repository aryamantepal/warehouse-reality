# Deploying the live app

The live app ships as one Docker image (`Dockerfile` at the repo root). It runs the Next.js standalone server (`node server.js`) on port 3000 as the non-root `node` user.

## Before you deploy

Deploy from a `main` commit that passes every gate below. Run the commands from the repo root.

1. **The old deliberation route is gone.** `POST /api/agents/deliberate` had no auth, no rate limit and no budget, and called Nebius on every request. It is deleted on the merged line. This must print nothing:

   ```bash
   git ls-files app/api/agents
   ```

   If it prints a file, don't set `NEBIUS_API_KEY` on the host. The app then runs on the labeled fallback only.

2. **Live mode calls Nemotron.** `lib/run/registry.ts` wires `createNemotronDeliberator` for live runs on the merged line. If it still uses `ScriptedDeliberator`, every model call reports `model: "scripted"`. This must print a line:

   ```bash
   git grep -n createNemotronDeliberator lib/run/registry.ts
   ```

3. **The dashboard drives the run (B5).** Without B5 there's no "Run the D-108 scenario" button, and you can check the live flow only with the headless smoke test in the checklist. This must print nothing:

   ```bash
   grep -rn use-simulation components app
   ```

4. **The recorded run exists.** The replay check needs it. This must list the file:

   ```bash
   git ls-files public/runs/d108-nebius.json
   ```

## Run exactly one instance

Runs are owned by the server and kept in memory (`lib/run/registry.ts`). There is no database. This means:

- **One instance, one process.** A second instance has its own empty registry. If a load balancer sends `POST /api/runs` to instance A and `POST /api/runs/<id>/step` to instance B, B answers `404 RUN_NOT_FOUND`.
- **No scale-to-zero and no serverless functions.** A platform that stops the container when idle, or runs each request in a fresh function, loses every run. Vercel-style function hosting does not work for the live flow.
- **Don't restart or redeploy during the demo.** A restart or redeploy empties the registry, and any open browser tab then gets `RUN_NOT_FOUND`. Starting a new run recovers.
- **The registry holds 20 runs.** Creating a 21st run evicts the oldest idle run, with no restart involved. A tab whose run was evicted gets `404 RUN_NOT_FOUND` on its next step. Each demo start and each comparison creates a run, so a busy judging hour can hit this. Lane A follow-up: raise `MAX_RUNS` or evict by idle time instead of by count.

Replay (`/?replay=d108`) reads a static JSON file and survives restarts. See "Recorded run (replay)" below.

## Spend and abuse

The URL must stay unauthenticated, because a judge's browser can't send a token. Anyone who has the URL can start runs.

- Each run is capped at 60 model calls and 150 000 tokens (`lib/run/run.ts`).
- Nothing caps the number of runs or rate-limits `POST /api/runs`. Total spend has no limit while the endpoint runs.
- **Kill switch:** `nebius ai endpoint stop --id "$ENDPOINT_ID"`. Every request then fails and compute billing stops. Restart it with `nebius ai endpoint start --id "$ENDPOINT_ID"`; the URL stays the same and the registry starts empty.
- If spend climbs while the site must stay up, revoke the key in Token Factory. Runs keep working on the labeled fallback.
- Share the URL only with judges, and stop the endpoint when nobody is judging.

Lane A follow-up: a process-wide cap on runs and model calls in `lib/run/`.

## Environment variables

Set these as runtime environment variables on the host, never as build arguments. The image bakes in no values, and the key never reaches the browser.

| Name | Required | Purpose |
| --- | --- | --- |
| `NEBIUS_API_KEY` | For real inference | Nebius Token Factory key. Without it every model call is the labeled fallback (`fallbackReason: "no_api_key"`), which does not meet the hackathon inference requirement. |
| `NEBIUS_BASE_URL` | No | Token Factory base URL. Defaults to the us-central1 endpoint (`lib/agents/nebius-client.ts`, `lib/agents/models.ts`). |
| `NEBIUS_MODEL_NANO`, `NEBIUS_MODEL_SUPER`, `NEBIUS_MODEL_ULTRA` | No | Per-tier model overrides (`lib/agents/models.ts`). A blank value uses the tier default. The Nemotron deliberator and `scripts/smoke-token-factory.ts` read them. |
| `NEBIUS_MODEL` | No | Unused by runs since the old route was removed; listed in `.env.example` only. Use the per-tier overrides. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_TEST_MODEL` | **Never on the host** | Test-only Claude provider, used only when `NEBIUS_API_KEY` is blank. Calls are labeled `CLAUDE (TEST)`, never Nemotron. Don't set them on the deployed instance. |
| `TAVILY_API_KEY` | No | Tavily disruption scout (`POST /api/disruptions/live`). Without it the route returns labeled illustrative fixtures. Results are cached for 10 minutes per query and the route is rate limited. |
| `PORT`, `HOSTNAME` | No | Already set in the image (`3000`, `0.0.0.0`). Override `PORT` only if the host requires a specific port. |

Check `.env.example` for the current list before deploying. Never put a value in this file, in the Dockerfile, or in a commit.

## Build the image

Build only with the Dockerfile. With `output: "standalone"`, `pnpm build` copies `.env` and `.env.production` into `.next/standalone`, so never deploy a `.next/standalone` folder built on your machine. The image build excludes `.env*` (`.dockerignore`) and fails if an env file reaches the standalone output.

Nebius CPU platforms are x86_64, so build for `linux/amd64`, even on an Apple Silicon Mac:

```bash
docker buildx build --platform linux/amd64 -t warehouse-sim:latest .
```

To smoke-test it locally, pass the key from your shell and don't hard-code it:

```bash
docker run --rm -p 3000:3000 -e NEBIUS_API_KEY warehouse-sim:latest
```

Add `-e TAVILY_API_KEY` for the optional Tavily scout (`POST /api/disruptions/live`, cached 10 minutes per query and rate limited).

## Primary target: Nebius Serverless AI endpoint (CPU)

A Serverless AI endpoint is one container on one Compute VM. It serves requests at a managed HTTPS URL until you stop or delete it, and it is billed per second while running. It has no replica or autoscaling flags, so it meets the single-instance requirement. CPU-only platforms are supported: the official quickstart runs a `cpu-d3` endpoint.

Prerequisites:
- The Nebius CLI is installed, and the project ID is in `~/.nebius/config.yaml`.
- You have the `editor` role.
- You have quota for at least 1 VM and 1 public allocation.
- `jq` is installed.

1. **Create a registry and push the image.** Set `REGION_ID` to the project's region (for example `us-central1`).

   ```bash
   export REGION_ID=us-central1
   export REGISTRY_PATH=$(nebius registry create --name warehouse-sim \
     --format json | jq -r ".metadata.id" | cut -d- -f 2)
   nebius registry configure-helper   # docker credential helper, run as your normal user
   export IMAGE=cr.$REGION_ID.nebius.cloud/$REGISTRY_PATH/warehouse-sim:demo
   docker tag warehouse-sim:latest "$IMAGE"
   docker push "$IMAGE"
   ```

   An image in a Container Registry in the same project needs no registry credentials on the endpoint.

2. **Store the key in MysteryBox.** First export `NEBIUS_API_KEY` in your shell, for example from your password manager. `jq` builds the payload, so the value never appears on the command line or in shell history:

   ```bash
   nebius mysterybox secret create --name warehouse-sim-keys \
     --secret-version-payload "$(jq -cn --arg n "$NEBIUS_API_KEY" \
       '[{key:"NEBIUS_API_KEY",string_value:$n}]')"
   ```

   Once B6 merges, also export `TAVILY_API_KEY` and use this payload instead:

   ```bash
   nebius mysterybox secret create --name warehouse-sim-keys \
     --secret-version-payload "$(jq -cn \
       --arg n "$NEBIUS_API_KEY" --arg t "$TAVILY_API_KEY" \
       '[{key:"NEBIUS_API_KEY",string_value:$n},{key:"TAVILY_API_KEY",string_value:$t}]')"
   ```

   Each `--env-secret` key must match a payload key in the secret.

3. **Create the endpoint.** Leave `--auth` at its default, `none`. With token auth, every request needs an `Authorization: Bearer` header, and a browser opening the page can't send one.

   ```bash
   nebius ai endpoint create \
     --name warehouse-sim \
     --image "$IMAGE" \
     --platform cpu-d3 \
     --preset 4vcpu-16gb \
     --disk-size 50Gi \
     --container-port 3000 \
     --env-secret NEBIUS_API_KEY=warehouse-sim-keys \
     --public
   ```

   Once B6 merges and the secret holds `TAVILY_API_KEY`, add `--env-secret TAVILY_API_KEY=warehouse-sim-keys`.

   Notes:
   - Don't pass `--preemptible`: a preemptible VM can be stopped at any time, and non-GPU VMs support only the regular type anyway.
   - CPU workloads need at least a 20 GiB disk. The default is 250 GiB.
   - Non-secret overrides go in `--env KEY=VALUE`, for example `--env NEBIUS_MODEL_ULTRA=<id>`. A key can't appear in both `--env` and `--env-secret`.
   - `--subnet-id` defaults to the project's default subnet.

4. **Get the URL.**

   ```bash
   export ENDPOINT_ID=$(nebius ai endpoint get-by-name --name warehouse-sim \
     --format jsonpath='{.metadata.id}')
   nebius ai endpoint get "$ENDPOINT_ID" --format json | jq -r '.status.state'
   export APP_URL=$(nebius ai endpoint get "$ENDPOINT_ID" --format json \
     | jq -r '.status.public_endpoints[] | select(startswith("https://"))' | head -1)
   echo "$APP_URL"
   nebius ai endpoint logs "$ENDPOINT_ID"   # expect "Ready in" from Next.js
   ```

   Repeat the state command until it prints `RUNNING` (it passes through `PROVISIONING`, `IMAGE_PULLING` and `STARTING`). If no URL appears yet, retry after a few seconds. `ERROR` or `STOPPED` gives its cause in `.status.state_details`.

5. **Ship a new build without changing the URL.** You can't change an endpoint's settings (image, env vars, resources) in place. Deleting and recreating it gives a new URL, so don't. Instead, push the new image under the same tag (`:demo`, not a digest) and restart. The restart empties the run registry.

   ```bash
   docker buildx build --platform linux/amd64 -t warehouse-sim:latest .
   docker tag warehouse-sim:latest "$IMAGE"
   docker push "$IMAGE"
   nebius ai endpoint restart --id "$ENDPOINT_ID"
   nebius ai endpoint get "$ENDPOINT_ID" --format json | jq -r '.status.state'   # repeat until RUNNING
   nebius ai endpoint get "$ENDPOINT_ID" --format json \
     | jq -r '.status.public_endpoints[] | select(startswith("https://"))' | head -1
   ```

   The last command must print the same URL as `$APP_URL`. A restart, or a `stop` then `start`, keeps the URL and IP.

6. **Tear down after judging.** `nebius ai endpoint delete --id "$ENDPOINT_ID"` also deletes its VM and boot disk.

Not verified yet, because no Nebius account was available when this was written: the managed HTTPS proxy's request timeout for slow `POST /api/runs/<id>/step` calls. The step timing check in the checklist measures it.

## Recorded run (replay)

`/?replay=d108` (or the "Watch recorded run" button, also offered when a run is `RUN_NOT_FOUND`) fetches a static recording from `public/runs/`, validates it, and replays it through an in-browser engine. It needs no key, makes no model call and starts no server run, so it survives restarts and covers the case where the live endpoint is down.

The loader tries these files in order and moves on only on a 404:

1. `public/runs/d108-nebius.json`: a real Nemotron recording. Only turns genuinely answered by a Nebius model may produce this file.
2. `public/runs/d108-fallback.json`: no model answered; the banner says "not Nemotron".
3. `public/runs/d108-test-model.json`: a Claude test recording; the banner says "Test recording (Claude), not Nemotron". Never submit it as Nemotron output.

Create a recording against a running server (dev or built) that has a real key, then commit the file:

```bash
node scripts/record-run.ts --base http://localhost:3000
```

The script starts a live run, closes D-108, steps until done, and reads `GET /api/runs/<id>/export`. It chooses the output name from who answered, and prints a warning when the file is not a Nemotron recording. `--out <path>` overrides the name. If no recording is deployed, the UI says "No recording yet".

## Fallback: Render (one paid instance)

Use this fallback if the Nebius endpoint can't be created (quota, platform availability, or the proxy timing out on step calls). Any host works if it runs one long-lived container with no idle spin-down.

1. Push the branch to GitHub. In the Render Dashboard, choose **New → Web Service** and connect the repo.
2. Set **Language** to **Docker**. Leave **Dockerfile Path** empty: the Dockerfile is at the repo root.
3. Set **Instance Type** to **Starter** or higher. Don't use **Free**: Render spins a free web service down after 15 minutes with no traffic, and may restart it at any time, which loses every run.
4. Under **Environment**, add `NEBIUS_API_KEY` and any `NEBIUS_MODEL_*` overrides. Add `TAVILY_API_KEY` only once B6 merges. Also add `PORT=3000`; otherwise Render injects its default `PORT=10000`, which also works because the server reads `PORT`.
5. Keep the service at 1 instance and leave autoscaling off.
6. Deploy. Don't trigger another deploy during the demo: a deploy replaces the instance and empties the registry.

The spend kill switch on Render is **Suspend** on the service's Settings page.

## Verification checklist (plan Step 3)

Run these against the hosted URL (`APP_URL`). Browser checks use a fresh browser profile (a new Chrome profile or a private window with no extensions).

- [ ] `/` loads, and the 3D scene and dashboard render. The browser console shows no errors.

- [ ] The old deliberation route is gone. This must print `404`, never `200`:

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "$APP_URL/api/agents/deliberate" \
    -H 'content-type: application/json' -d '{}'
  ```

- [ ] Live D-108 calls Nemotron (headless smoke test). It starts a live run, closes D-108 to wake the agents, steps one turn, and prints each model call:

  ```bash
  RUN_ID=$(curl -sf -X POST "$APP_URL/api/runs" -H 'content-type: application/json' \
    -d '{"scenarioId":"d108","mode":"live"}' | jq -r .runId)
  curl -sf -X POST "$APP_URL/api/runs/$RUN_ID/disruptions" -H 'content-type: application/json' \
    -d '{"type":"dock_closure","targetId":"D-108"}' > /dev/null
  curl -sf -X POST "$APP_URL/api/runs/$RUN_ID/step" -H 'content-type: application/json' \
    -d '{"maxTurns":1}' > step.json
  jq '.snapshot.modelCalls[] | {model, isFallback, fallbackReason}' step.json
  jq -e '[.snapshot.modelCalls[] | select((.model | ascii_downcase | contains("nemotron")) and (.isFallback | not))] | length > 0' step.json
  ```

  The last command must print `true`. Otherwise, read the printed calls:

  | What you see | Cause |
  | --- | --- |
  | `model: "scripted"` | The image was built without B2 wired into `lib/run/registry.ts`. See "Before you deploy". |
  | `fallbackReason: "no_api_key"` | `NEBIUS_API_KEY` doesn't reach the container. Check the `--env-secret` flag and the secret's payload key. |
  | `fallbackReason: "http_error"` | Token Factory refused the call: wrong or revoked key, a model id the account can't use, or a rate limit. Check `nebius ai endpoint logs`. |
  | `fallbackReason: "timeout"` | Token Factory took longer than the deliberator's 20 s timeout. |

- [ ] Once B5 ships: click "Run the D-108 scenario". Model badges show Nemotron model ids with no `FALLBACK` tag.

- [ ] A step finishes inside the proxy timeout. The browser sends no `maxTurns`, so each step runs up to 4 turns, and each turn can wait up to 20 s for Token Factory: about 80 s worst case. On a fresh run, time a 4-turn step:

  ```bash
  RUN_ID=$(curl -sf -X POST "$APP_URL/api/runs" -H 'content-type: application/json' \
    -d '{"scenarioId":"d108","mode":"live"}' | jq -r .runId)
  curl -sf -X POST "$APP_URL/api/runs/$RUN_ID/disruptions" -H 'content-type: application/json' \
    -d '{"type":"dock_closure","targetId":"D-108"}' > /dev/null
  curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' -X POST "$APP_URL/api/runs/$RUN_ID/step" \
    -H 'content-type: application/json' -d '{"maxTurns":4}'
  ```

  It must print `200`. A `502` or `504` at a round time (such as `60.0s`) means the proxy cut the request. The server keeps stepping anyway, so the browser's next step gets `409 RUN_BUSY` until that step finishes. Fix: make `stepRunRequest` in `lib/dashboard/run-client.ts` send `{ maxTurns: 1 }` or `2` (lane B follow-up), or move to the Render fallback.

- [ ] `/?replay=d108` plays the recorded run with no key involved. The banner states when it was recorded and which models answered; a Claude recording says "Test recording (Claude), not Nemotron".

- [ ] An unknown run id returns 404 with `RUN_NOT_FOUND`:

  ```bash
  curl -s -w ' %{http_code}\n' "$APP_URL/api/runs/does-not-exist"
  # {"error":"RUN_NOT_FOUND"} 404
  ```

- [ ] The key isn't in anything the browser can load. Export `NEBIUS_API_KEY` in your shell first. Both commands must print `clean`.

  The image's static files (`.next/static` and `public`):

  ```bash
  K="$NEBIUS_API_KEY" docker run --rm -e K --entrypoint sh warehouse-sim:latest -c \
    'if [ -z "$K" ]; then echo "export NEBIUS_API_KEY first"; elif grep -rqF -- "$K" .next/static public; then echo LEAK; else echo clean; fi'
  ```

  The served page:

  ```bash
  if [ -z "$NEBIUS_API_KEY" ]; then echo "export NEBIUS_API_KEY first"
  elif curl -s "$APP_URL/" | grep -qF -- "$NEBIUS_API_KEY"; then echo LEAK
  else echo clean; fi
  ```

## Sources (checked 2026-10-29)

- Nebius Serverless AI overview: https://docs.nebius.com/serverless/overview
- Endpoint quickstart (CPU `cpu-d3` example, URL lookup, logs, delete): https://docs.nebius.com/serverless/quickstart/endpoints
- Managing endpoints (`--env-secret`, auth, CPU disk size, image update under the same tag): https://docs.nebius.com/serverless/endpoints/manage
- Stopping, starting and restarting endpoints (URL and IP kept): https://docs.nebius.com/serverless/maintenance/stop-start
- Endpoint states (`status.state`): https://docs.nebius.com/serverless/lifecycle
- `nebius ai endpoint` CLI reference (`create`, `stop`, `start`, `restart`): https://docs.nebius.com/cli/reference/ai/endpoint/
- CPU platforms and presets: https://docs.nebius.com/compute/virtual-machines/types
- Container Registry quickstart: https://docs.nebius.com/container-registry/quickstart
- MysteryBox secret create: https://docs.nebius.com/mysterybox/secrets/create
- Render free tier spin-down: https://render.com/docs/free
- Render Docker deploys and `PORT`: https://render.com/docs/docker, https://render.com/docs/web-services
- Next.js standalone output: `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`; env-file copying: `node_modules/next/dist/build/index.js` (`.env`, `.env.production`)
