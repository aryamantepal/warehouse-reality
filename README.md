# Warehouse Sim

Warehouse decision rehearsal for the Nebius x NVIDIA Global AI Hackathon (track: Best Apps and Agents).

- Hosted demo: `<HOSTED_URL>`
- Recorded run (no key needed): `<HOSTED_URL>/?replay=d108`
- Demo video (YouTube): `<VIDEO_URL>`

## What it is

A supervisor rehearses a warehouse disruption before acting on it. Close dock door D-108 and four software agents (a driver, a dock lead, a yard controller and a supervisor) negotiate a way out through structured messages. Each agent sees only its own observation. A deterministic TypeScript engine owns physical state, resource reservations and logical time, and it is the only thing that can change them.

The agents run on NVIDIA Nemotron models served from Nebius Token Factory, one model tier per role. The dashboard shows, for every agent turn, which model answered, how long it took, how many tokens it used, and whether that turn was a real Nemotron reply or a labeled fallback. A comparison panel replays the same scenario under first-come-first-served rules so the two can be read side by side.

This is a rehearsal tool, not a validated replica of any real warehouse. See [Evidence and scope](#evidence-and-scope).

## How agents negotiate through engine tool contracts

1. A model reply is only a proposal. `lib/agents/nemotron-deliberator.ts` sends the turn to the role's model with native tool calls (`lib/agents/tool-definitions.ts`, generated from the Zod schemas in `lib/agents/schemas.ts`, `tool_choice: required`, with an explicit `wait` tool) and validates the returned call against those schemas. Text-only, malformed or unknown-tool replies propose nothing and are recorded as `malformed_tool_call` fallbacks. Each turn has a 20 second timeout.
2. The proposal goes through `lib/run/authorize.ts`, a role permission matrix that returns `PERMISSION_DENIED` when an agent acts outside its role.
3. `lib/run/proposal-adapter.ts` turns it into an engine commitment, and `lib/run/turns.ts` calls the engine's tool contracts: propose, accept, commit, executeMove, executeUnload, cancel, escalate. The engine validates and commits atomically, rejects stale state versions, deduplicates request IDs, and rejects conflicting reservations with `RESOURCE_UNAVAILABLE`.
4. Accepted and rejected outcomes both become visible run events. Rendering never decides an outcome; the engine and agents work with graphics disabled.

The scenario (`lib/run/scenarios/d108.ts`): trailer T-2291 is at D-108 with a shipment partly unloaded. Closing D-108 forces a relocation. The target is dock D-112, and a second trailer, T-3061, is a contender for the same resources. All of these are scenario values chosen for the rehearsal, not facility data.

### Model tiers

| Tier | Default model id | Roles |
| --- | --- | --- |
| nano | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | driver |
| super | `nvidia/nemotron-3-super-120b-a12b` | dock lead, yard controller |
| ultra | `nvidia/Nemotron-3-Ultra-550b-a55b` | supervisor |

Defaults live in `lib/agents/models.ts` and can be overridden per tier with `NEBIUS_MODEL_NANO`, `NEBIUS_MODEL_SUPER`, `NEBIUS_MODEL_ULTRA`. Whether each id is available on a given Token Factory account is checked by `scripts/smoke-token-factory.ts`; availability is not asserted here.

Each run has a budget cap of 60 model calls and 150,000 tokens. When either is reached, remaining turns use the first-come baseline and are labeled `BASELINE`.

## Provenance labels

Nothing shown as model output is unlabeled.

| Label | Meaning |
| --- | --- |
| `NEMOTRON` | A real Token Factory reply that passed validation. Shows model id, tier, latency and tokens ("unknown" if the provider reported no usage). |
| `FALLBACK` | The model call failed (`no_api_key`, `http_error`, `timeout`, `malformed_tool_call`, `budget_exhausted`) and deterministic local rules stood in. Never displayed as Nemotron. |
| `BASELINE` | A first-come-first-served turn: the comparison run, or turns after the budget cap. No model is called. |
| `external_search` | A disruption that carries source URLs from an outside search. The run API accepts `sources` on a disruption and tags the event this way. The Tavily scout is `POST /api/disruptions/live` (server-side key, results cached 10 minutes per query, rate limited with a global and a per-client bucket). Live hits keep their URL; with no key or no match it returns `[Illustrative]` fixtures, which are injected as plain operator disruptions, never as `external_search`. The disruption modal has no scout button yet. |
| `CLAUDE (TEST)` | Test-only: when `NEBIUS_API_KEY` is blank and `ANTHROPIC_API_KEY` is set, live turns go to the Anthropic Messages API (`ANTHROPIC_TEST_MODEL`, default `claude-haiku-5-5`) with the same tool definitions mapped to Anthropic `tools`, and provenance `test_model`. Never shown, recorded or exported as Nemotron; recordings go to `public/runs/d108-test-model.json`. Not for the submission. If `NEBIUS_API_KEY` is set, Nebius is used and the Claude key is ignored. |

Other event labels are `engine`, `operator` (a human-injected hypothetical), and `replay`. The facility panel also uses `src`, `drv`, `hyp`, `unk` and `ill` badges for sourced, derived, hypothetical, unknown and illustrative values.

## Run locally

Use Node.js 24 and pnpm 12.11.2 (pinned in `package.json`).

```bash
nvm use                         # if you use nvm; otherwise install Node.js 24
npm install --global pnpm@12.11.2
pnpm install --frozen-lockfile
# Only if .env.local does not already exist:
cp -n .env.example .env.local
pnpm dev
```

Open [localhost:3000](http://localhost:3000). With no key, every turn is a labeled `FALLBACK` or `BASELINE`, which is useful for development and does not satisfy the hackathon's NVIDIA-on-Nebius requirement. A WebGL-capable browser is needed for the 3D scene.

Try it: press **Run the D-108 scenario** (the guided demo: start a run, close D-108, step until done, with a step log, a Stop button and a budget meter), or use **Disruption** and **Step** yourself, then open **Compare with first-come rules**. The Calls tab lists every model call with its badge.

## Recorded run (replay)

Open `/?replay=d108` (or press "Watch recorded run", next to the guided button and in the `RUN_NOT_FOUND` notice). The browser fetches `/runs/d108-nebius.json`, then `/runs/d108-fallback.json`, then `/runs/d108-test-model.json`, validates the file, and replays it through an in-browser engine. It needs no key, makes no model call and starts no server run, so it is the safest way for a judge to see a result. A banner states that it is a recording, when it was made and which models answered. A fallback recording is labeled "not Nemotron", and a Claude recording says "Test recording (Claude), not Nemotron". If no recording file is deployed, the UI says "No recording yet".

`public/runs/d108-nebius.json` is created by `node scripts/record-run.ts --base http://localhost:3000` against a dev server with a real key. `<TODO: the team commits the real recording; none is committed at this commit>`

## Environment variables

Server-side only. Never prefix with `NEXT_PUBLIC_`; the browser never calls Token Factory.

| Variable | Purpose |
| --- | --- |
| `NEBIUS_API_KEY` | Token Factory API key; blank means every turn is a labeled fallback |
| `NEBIUS_BASE_URL` | Defaults to `https://api.tokenfactory.us-central1.nebius.com/v1` |
| `NEBIUS_MODEL_NANO`, `NEBIUS_MODEL_SUPER`, `NEBIUS_MODEL_ULTRA` | Optional per-tier overrides; blank uses the default |
| `NEBIUS_SMOKE_MAX_TOKENS` | Optional completion cap for the smoke script (default 4096) |
| `TAVILY_API_KEY` | Optional; enables live results in the Tavily scout, otherwise labeled illustrative fixtures |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_TEST_MODEL` | Test only: used only when `NEBIUS_API_KEY` is blank. Default model `claude-haiku-5-5`. Never set on the deployed host |

The model and regional endpoint follow the [official Nebius Nemotron Super quickstart](https://github.com/nebius/token-factory-cookbook/blob/main/models/nemotron/nemotron3-super-120B.md), checked October 26, 2026. Inference runs only inside the server-owned run (`/api/runs`). An HTTP 200 alone is not evidence of live inference; check the `NEMOTRON` tag. [Nebius API documentation](https://docs.tokenfactory.nebius.com/api-reference/introduction).

## Tests

```bash
pnpm check       # Biome, generated route types, TypeScript, unit tests
pnpm build       # production build (next/font downloads Google fonts)
pnpm start       # serve a successful production build
```

Individual checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`. Provider tests use mocked HTTP responses. Unit tests passing is not evidence that a live Nebius run works. To check which tiers a key can reach, run `node scripts/smoke-token-factory.ts`.

Deployment (single long-lived instance, because runs live in memory; Dockerfile and checklist): [docs/deploy.md](docs/deploy.md).

## Repository map

| Path | Responsibility |
| --- | --- |
| `app/` | Next.js App Router shell and API handlers |
| `components/dashboard/` | Controls, evidence, agent and commitment inspection, timeline |
| `components/scene/` | React Three Fiber scene, selection, assets, graphics recovery |
| `lib/engine/` | State, event queue, physical checks, commitments, snapshots |
| `lib/agents/` | Role prompts, memory/messages, tool schemas and definitions, agent registry, Nemotron deliberator, Nebius client, test-only Claude client |
| `lib/external/` | Tavily scout, rate limit, TTL cache, illustrative fixtures |
| `lib/run/` | Server-owned run: tool authorization, proposal adapter, baseline and replay deliberators, metrics, recording |
| `lib/dashboard/` | Run client hook, badges, comparison and replay view models, fixture data |
| `lib/scene/` | Facility constants, schematic layout, illustrative entities |
| `types/` | Dashboard view types |
| `docs/` | Product requirements, architecture, submission plan, research, earlier mockups |

Read [the architecture](docs/architecture.md), [submission checklist and demo plan](docs/hackathon.md), and [product requirements](docs/idea_intro.md), in that order. The PRD's acceptance catalogue is a target, not a report that every feature is implemented. Submission drafts are in [docs/submission/](docs/submission/).

## Known gaps

- No Nebius recording is committed yet, and no live inference has been verified from this repository.
- The facility layout is schematic until a site plan is traced, and the UI says so.
- `docs/architecture.md` is dated October 26 and its numbered gap list partly predates the server-owned run; where they differ, the code wins.

## Evidence and scope

The repository records DFW Commerce Center Building I's published capacities: 182 dock-high doors, four ramp doors, and 235 trailer spaces. These describe property capacity, not observed occupancy or staffing. Layout positions are schematic. Workloads, sample agents, equipment, and disruptions are illustrative or hypothetical unless explicitly sourced. This is not a validated replica of Amazon's warehouse operations.

## License

Project code is [MIT licensed](LICENSE). Third-party models retain their original licenses and required attribution: [shipped assets](public/models/ATTRIBUTION.md) and [mockup assets](docs/mockups/assets/ATTRIBUTION.md). NVIDIA models are accessed through Nebius and are not distributed in this repository.
