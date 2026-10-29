# NVIDIA and Nebius feedback (template)

For the Devpost feedback prompt. Part 1 states only what the code does. Part 2 is for the team's real experience; leave nothing in it that was not actually experienced.

## 1. Facts from our integration (from the code)

- **Service and endpoint.** Nebius Token Factory, OpenAI-compatible `POST {base}/chat/completions`, default base `https://api.tokenfactory.us-central1.nebius.com/v1`. Bearer-key auth, key held server-side only.
- **Models by role** (`lib/agents/models.ts`): `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` (driver), `nvidia/nemotron-3-super-120b-a12b` (dock lead, yard controller), `nvidia/Nemotron-3-Ultra-550b-a55b` (supervisor). Each tier is overridable by env, so a tier that is not available to an account can be pointed at another model. Whether these ids were available to us is `[TODO]`.
- **Tool calls are JSON in message content.** We send a prompt, set `response_format: { type: "json_object" }` and `temperature: 0.1`, and parse a `{ thought, toolCall }` object out of `choices[0].message.content` ourselves. We do not use the API's native `tools` / `tool_choice` parameters in the run path. Reason and whether native tool calling worked for us: `[TODO]`.
- **Defensive parsing.** We strip a Markdown code fence before `JSON.parse`, validate the tool call with Zod, and treat anything else as `malformed_tool_call`. The code was written expecting fenced or non-JSON replies sometimes; how often it happened is `[TODO: measured count]`.
- **Usage.** We read `usage.prompt_tokens` and `usage.completion_tokens` and record `null` (shown as "unknown") when absent.
- **Timeout and failure handling.** 20 s request timeout. Failures are classified `no_api_key`, `http_error`, `timeout` or `malformed_tool_call` and shown in the UI.
- **Budget.** 60 calls and 150,000 tokens per run, enforced by us.
- **Smoke test.** `scripts/smoke-token-factory.ts` lists models and sends one tool-call request per tier. Its output on a real key: `[TODO: paste]`.

## 2. Our experience (team to fill)

- Onboarding and getting a key / credits: `[TODO]`
- What worked well, with an example run: `[TODO]`
- A failed request or malformed output, with reproduction steps and redacted logs: `[TODO]`
- Observed latency and token usage, with sample size (only from the recording): `[TODO]`
- Model behavior differences between Nano, Super and Ultra for our task: `[TODO]`
- Documentation gaps (model id naming and casing, tool-calling guidance, regions): `[TODO]`
- One suggested improvement and why it matters: `[TODO]`

## 3. Before submitting
- [ ] Every `[TODO]` is filled or deleted.
- [ ] No number appears that is not from our own recorded run.
- [ ] No key, token or private log content is included.
