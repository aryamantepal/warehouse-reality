# Demo video script (target 2:30, hard limit 3:00)

For a person to record. Screen capture plus voiceover. Upload as a public YouTube video and put the link in `<VIDEO_URL>`.

Before recording
- Use the real key and the hosted or local build, so `NEMOTRON` badges appear. If only `FALLBACK` badges appear, say so in the voiceover instead of calling it Nemotron.
- Hide `.env.local`, terminals with keys and the browser's saved credentials.
- Do a dry run first. Beats marked `[confirm after recording]` depend on what actually happens; do not narrate a number you did not see on screen.
- Keep the schematic and illustrative labels visible. Do not zoom past them.

## Shot list

| Time | On screen | Voiceover (adapt to what you see) |
| --- | --- | --- |
| 0:00-0:15 | Dashboard with the 3D warehouse, no run yet | "A dock door closes mid-shift. Who moves, who waits, and who gets the next door? Warehouse Sim lets a supervisor rehearse that before it happens." |
| 0:15-0:35 | Facility panel and evidence badges; hover the schematic note | "The only facility facts are published capacities for DFW Commerce Center Building I: 182 dock doors, 4 ramp doors, 235 trailer spaces. The layout is schematic and the scenario values are rehearsal inputs, labeled as such." |
| 0:35-0:55 | Click **Run the D-108 scenario**; status line reads "Closing dock door D-108...", then "Agents negotiating - step N..." | "One button starts a run, closes door D-108 and steps the agents until they finish. Four agents, each seeing only its own view, negotiate through structured messages." |
| 0:55-1:30 | Timeline and Agent/Commitment tabs: offer, acceptances, commit, trailer T-2291 moves to D-112; open one turn | "The dock lead offers D-112, the driver and yard controller accept, and the engine commits it. A model reply is only a proposal: it is validated, role-checked, and committed or rejected by the engine." |
| 1:30-1:55 | Zoom on a model-call badge: `NEMOTRON`, model id, tier, latency, tokens | "Every turn shows which model answered, its tier, latency and tokens. Driver on Nano, dock and yard on Super, supervisor on Ultra, served by Nebius Token Factory." `[confirm after recording: which tiers answered; read values off the screen]` |
| 1:55-2:10 | A rejected proposal in the timeline with its reason code; the budget meter (calls / 60, tokens / 150,000) | "When a proposal conflicts, the engine rejects it and says why. If anything fails, a labeled fallback turn takes over and is never shown as Nemotron." `[confirm after recording: that a rejection occurs in the recording; if none, skip the claim]` |
| 2:10-2:35 | Open **Compare with first-come rules**, press **Run baseline on same inputs**, show the table and the provenance line | "Same scenario, same disruption, first-come rules. We report what each run measured and declare no winner. Anything the record cannot support stays 'unknown'." Read only numbers visible in the table. `[confirm after recording]` |
| 2:35-2:50 | Open `/?replay=d108`; the recording banner with date and model ids | "Judges can watch the recorded run with no key: replay makes no model calls, and the banner says when it was recorded and which models answered." |
| 2:50-3:00 | Title card with `<HOSTED_URL>` and the repo URL | "Warehouse Sim, on NVIDIA Nemotron and Nebius Token Factory. Link below." |

If over time, cut the facility shot to 10 seconds and the replay shot to 10 seconds.

Do not show or say: any latency, token or improvement number you did not read off the recording; "ShiftWorld"; claims that this matches real Amazon operations; Tavily, unless the Tavily scout exists in the build you record.

## Checklist after upload
- [ ] Video is public, 3:00 or shorter, and at least one minute shows the product working.
- [ ] Real model ids are legible on screen.
- [ ] No key or token visible anywhere.
- [ ] `<VIDEO_URL>` pasted into README.md and the Devpost form.
