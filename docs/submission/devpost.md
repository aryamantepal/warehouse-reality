# Devpost draft

Track: **Best Apps and Agents**. Links: hosted demo `<HOSTED_URL>`, replay `<HOSTED_URL>/?replay=d108`, video `<VIDEO_URL>`, repo `<REPO_URL>`.

Rule for this draft: no metric, latency, token count or result appears unless the team measured it from the real Nebius recording. Every claim that depends on that recording is tagged `[confirm after recording]`. Delete the tag only after checking the claim against `public/runs/d108-nebius.json`.

## Inspiration

When a dock door closes mid-shift, the consequences spread: a driver is stuck at the wrong door, the yard has to move a trailer, another load wants the same space. A supervisor usually finds out by living through it. We wanted a place to rehearse that decision first, where the people and systems involved are separate actors who have to agree, instead of one script that knows everything.

## What it does

Warehouse Sim is a decision-rehearsal simulator for a warehouse disruption. You close dock door D-108 (one button runs the whole scenario, or you drive it step by step). A driver, a dock lead, a yard controller and a supervisor each see only their own observation and talk through structured messages: offers, acceptances, commitments. They agree on moving trailer T-2291 to dock D-112 while a second trailer, T-3061, competes for the same resources. A deterministic engine decides what is physically possible.

What you can inspect:

- Every agent turn carries a badge: `NEMOTRON`, `FALLBACK` or `BASELINE`, with model id, tier, latency and tokens (or "unknown" when the provider did not report usage). A fallback is never shown as Nemotron.
- Rejected proposals are visible events with the engine's reason code (for example `RESOURCE_UNAVAILABLE` or `PERMISSION_DENIED`), not hidden errors.
- A comparison panel runs the same scenario and disruptions under first-come-first-served rules, never calls a column better, shows unmeasured values as "unknown", and says plainly when a column is first-come rules or a Claude test model rather than Nemotron.
- A recorded run replays in the browser with no key and no model call (`/?replay=d108`); the banner says when it was recorded and which models answered.

Scenario values (trailers, shipment, the D-108 and D-112 doors) are rehearsal inputs, not facility data. The only facility facts are the published capacities of DFW Commerce Center Building I (182 dock-high doors, 4 ramp doors, 235 trailer spaces), which describe capacity, not occupancy or staffing. The layout is schematic.

## How we built it

- **Engine.** Pure, deterministic TypeScript with no React imports: state, an event queue, logical time, commitments, resource reservations, stale-version rejection and idempotent request IDs.
- **Agents on NVIDIA Nemotron via Nebius Token Factory.** One model tier per role: Nano 30B for the driver, Super 120B for the dock lead and yard controller, Ultra for the supervisor (ids in `lib/agents/models.ts`, overridable by env). The server calls the Token Factory chat completions endpoint with native tool calls. [confirm after recording: which tiers actually answered on our account]
- **Tool contracts.** A model reply is only a proposal. Its tool call is validated with the Zod schemas, checked against a role permission matrix, adapted into an engine commitment, and committed or rejected atomically. The model never mutates state directly.
- **Budget.** Each run is capped at 60 model calls and 150,000 tokens; after that, turns use the first-come baseline and are labeled `BASELINE`.
- **Honest fallback.** No key, HTTP error, timeout or an unusable reply produces a labeled fallback turn and the run continues.
- **Recording and replay.** A run exports every deliberator decision and disruption (`GET /api/runs/:id/export`, `scripts/record-run.ts`); the browser replays that file through a fresh engine with no model call.
- **Guided demo and budget meter.** One button runs the whole scenario with a step log, a Stop button and a live budget meter; the Calls tab lists every model call with its badge.
- **Test-only provider.** Before a Nebius key existed we exercised the loop with a Claude model, labeled `CLAUDE (TEST)` everywhere and never recorded or shown as Nemotron. It is disabled when a Nebius key is set and is not part of the submission.
- **UI.** Next.js 16, React 19, TypeScript strict, Tailwind 4, a blocky low-poly React Three Fiber scene, Biome and Vitest. The model key stays on the server.

## Challenges

- Making model output safe to act on. Models return text, near-JSON or the wrong tool, so we validate every reply and treat anything unusable as "no action, labeled fallback" rather than guessing.
- Keeping provenance honest end to end, so a fallback or baseline turn can never pass as Nemotron in the badges, the comparison or the replay banner.
- Showing real negotiation without a sprawling simulation: one small scenario (D-108 to D-112 with a contender) verified end to end.
- Running with a server-held, in-memory run: live use needs a single long-lived instance, which is why a replay path exists for judges.
- `[TODO: the team's real challenges with Token Factory or Nemotron: rate limits, tool-call behavior, latency, anything you hit]`

## Accomplishments we are proud of

- Agents negotiate through engine tool contracts, and conflicts are rejected by the engine, not papered over.
- Every model call records model, tier, fallback flag, latency and token usage, and the UI shows it.
- The comparison panel refuses to call a fallback run "Nemotron versus first-come".
- The engine and agents work headless with graphics disabled.
- Real-recording results: `[confirm after recording]` `[TODO: only measured numbers from the recording, for example how many turns were NEMOTRON, how many proposals were rejected, the metrics the comparison panel shows]`

## What we learned

- Treat the model as a proposer and the engine as the authority; it made failures cheap to contain.
- Model tiering by role is easy to wire; whether it pays off in quality or cost is something we have not measured. [confirm after recording]
- `[TODO: team's own lessons about NVIDIA Nemotron and Nebius Token Factory]`

## What's next

- Trace a site plan so the layout stops being schematic.
- Replace scenario values with an evidence-recorded workload (source, unit, date, classification, interpretation for every number).
- More roles and more disruption types (equipment failure exists in the engine).
- Branch from checkpoints and export run evidence.
- Broader mapping of live news into hypotheticals (today only weather → D-108 closure and highway → DRV-047 delay, with durations left unknown).

## Built with

NVIDIA Nemotron (Nano, Super, Ultra tiers), Nebius Token Factory, Next.js 16, React 19, TypeScript, Zod, React Three Fiber, Tailwind CSS 4, Vitest, Biome, Docker, Tavily.

## Submission fields

- Change record: the hackathon period started Aug 26 and this project began Oct 10 (from the plan; verify against repo history). `[confirm]`
- Feedback prize: see `feedback.md`.
- Tavily prize: `POST /api/disruptions/live` searches Tavily server-side (results cached for 10 minutes per query, rate limited); a live result can be injected as a hypothetical disruption labeled `external_search` with its source URL, and offline fixtures are labeled illustrative. The disruption modal has no scout button yet. `[TODO: confirm the team is entering, and whether a scout button ships before submission]`
- Final checks: repo public with the MIT license visible at the root; hosted URL and replay URL work logged out; submit by 09:00 PT Friday.
