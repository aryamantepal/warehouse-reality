# Warehouse Sim · ShiftWorld

Warehouse decision rehearsal for the Nebius × NVIDIA Global AI Hackathon. Explore a warehouse in 3D, inject a disruption, and inspect how driver, dock, yard, and supervisor agents propose operational changes. A TypeScript engine owns resource reservations and physical state.

**Status: working prototype with incomplete integration.** The browser dashboard currently uses a local engine and deterministic agent fallback. The server deliberation API can call Nebius independently. The scene and several dashboard summaries still use illustrative data. See [architecture and known gaps](docs/architecture.md) before treating a displayed outcome as an executed simulation.

The product plan calls this application **ShiftWorld**; the package and interface currently use **Warehouse Sim**.

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

Open [localhost:3000](http://localhost:3000). No credentials are needed to explore the illustrative dashboard or run unit tests. A WebGL-capable browser is needed for the 3D scene.

```bash
pnpm check       # Biome, generated route types, TypeScript, unit tests
pnpm build       # production build (next/font downloads Google fonts)
pnpm start       # serve a successful production build
```

Individual checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`. GitHub Actions runs these checks and the production build without provider secrets.

## NVIDIA inference on Nebius

Set these server-side values in `.env.local`, then restart the development server:

| Variable | Purpose |
| --- | --- |
| `NEBIUS_API_KEY` | Token Factory API key; blank enables deterministic fallback |
| `NEBIUS_BASE_URL` | Defaults to `https://api.tokenfactory.us-central1.nebius.com/v1` |
| `NEBIUS_MODEL` | Defaults to `nvidia/nemotron-3-super-120b-a12b` |
| `TAVILY_API_KEY` | Optional external-disruption search; blank returns illustrative fixtures |

The model and regional endpoint follow the [official Nebius Nemotron Super quickstart](https://github.com/nebius/token-factory-cookbook/blob/main/models/nemotron/nemotron3-super-120B.md), checked October 26, 2026. Confirm model availability for your account in the Token Factory playground. Provider keys are never browser configuration: do not prefix them with `NEXT_PUBLIC_`. Keep `.env.local` untracked.

Inference runs only inside the server-owned run (`/api/runs`). Each model call records its model id, tokens, latency and whether it was a fallback. Missing credentials, HTTP errors, malformed output and timeouts use a labeled fallback; an HTTP 200 alone is not evidence of live inference.

The hackathon requires actual NVIDIA open-model inference on Nebius. Offline fallback is useful for development but does not satisfy that requirement. [Nebius API documentation](https://docs.tokenfactory.nebius.com/api-reference/introduction) describes authentication and compatible requests.

## Repository map

| Path | Responsibility |
| --- | --- |
| `app/` | Next.js App Router shell and API handlers |
| `components/dashboard/` | Controls, evidence, agent and commitment inspection, timeline |
| `components/scene/` | React Three Fiber scene, selection, assets, graphics recovery |
| `lib/engine/` | State, event queue, physical checks, commitments, snapshots |
| `lib/agents/` | Role prompts, memory/messages, tool schemas, runner, Nebius client |
| `lib/external/` | Tavily search and illustrative fallback disruptions |
| `lib/dashboard/` | Run client hook and dashboard fixture data |
| `lib/scene/` | Facility constants, schematic layout, illustrative entities |
| `types/` | Dashboard view types |
| `docs/` | Product requirements, architecture, submission plan, research, earlier mockups |

Read [the architecture](docs/architecture.md), [submission checklist and demo plan](docs/hackathon.md), and [product requirements](docs/idea_intro.md), in that order. The PRD's acceptance catalogue is a target, not a report that every feature is implemented.

## Evidence and scope

The repository records DFW Commerce Center Building I's published capacities: 182 dock-high doors, four ramp doors, and 235 trailer spaces. These describe property capacity, not observed occupancy or staffing. Layout positions are schematic. Workloads, sample agents, equipment, and disruptions are illustrative or hypothetical unless explicitly sourced. This is not a validated replica of Amazon's warehouse operations.

## License

Project code is [MIT licensed](LICENSE). Third-party models retain their original licenses and required attribution: [shipped assets](public/models/ATTRIBUTION.md) and [mockup assets](docs/mockups/assets/ATTRIBUTION.md). NVIDIA models are accessed through Nebius and are not distributed in this repository.
