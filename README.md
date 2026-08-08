# @klaroshield/sdk

The AI Runtime every AI application installs on Day 1. Not a gateway, not a
security platform — a local middleware pipeline that wraps your existing
OpenAI/Anthropic/Vercel-AI-SDK calls with retries, budget control, secret
and PII redaction, structured output validation, and local logging.

**Zero required cloud account. Zero required API key of ours. Wraps your
existing provider SDK — never replaces it.**

## Install

```bash
npm install @klaroshield/sdk
```

## Use

```ts
import { Klaro, retries, budget, secrets, pii, logging } from "@klaroshield/sdk";
import OpenAI from "openai";

const openai = new OpenAI();

const klaro = new Klaro()
  .use(retries({ max: 3, backoff: "exponential" }))
  .use(budget({ maxMonthlyUsd: 50 }))
  .use(secrets({ mode: "mask" }))
  .use(pii({ mode: "mask", types: ["email", "phone", "ssn", "credit_card"] }))
  .use(logging({ format: "pretty" }));

const chat = klaro.wrap(openai.chat.completions.create.bind(openai.chat.completions));

const response = await chat({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "hello" }],
});
```

`klaro.wrap()` accepts any async function — it works the same way whether
you're calling OpenAI, Anthropic, or a Vercel AI SDK `generateText` call,
because it wraps *your* call, not a specific provider's API shape.

**A real TypeScript caveat, not a runtime issue:** wrapping a class method
via `.bind()` (required so `this` still resolves inside the provider SDK)
goes through `Function.prototype.bind`'s own deliberately weak type
signature, which loses overload resolution for methods like OpenAI's
`create()` that return a different type for `stream: true` vs `stream:
false`. Runtime behavior is correct either way; if TypeScript can't narrow
the result type, cast it explicitly (`as ChatCompletion`, `as Message`) —
see `examples/openai.ts` and `examples/anthropic.ts`.

Every middleware runs entirely in-process. Nothing here calls out to a
KlaroShield server. `.klaro/` (created in your project root on first use)
holds local logs and spend records — inspect it with the CLI, or just read
the JSON Lines files directly.

## CLI

```bash
npx klaro init       # scaffold klaro.config.ts
npx klaro doctor     # provider connectivity (real API check), retry health, cost-optimization recommendations, health score
npx klaro inspect    # recent requests: latency, redactions
npx klaro stats      # "Today's AI Health": retries saved, secrets/PII removed, cost, latency, budget remaining, health score
npx klaro explain    # plain-language narration of a call's full retry/redaction history
npx klaro simulate   # runs rate-limit/500/timeout/bad-JSON/injection/huge-prompt scenarios through YOUR configured pipeline
npx klaro dashboard  # local web dashboard -- request stream, spend, redactions, health score
npx klaro report --format md|json|html --out <path>   # export the same data as a file
npx klaro version
npx klaro telemetry status   # what's collected, what's never collected, enable/disable
```

## Telemetry

The CLI and SDK send anonymous, privacy-first product telemetry by
default -- helps us understand adoption (installs, active projects,
which middleware people actually use) without any registration.

**Never sent, ever:** prompts, responses, model output, API keys,
secrets, PII, local file paths, or anything from `.klaro/logs.jsonl`.
Only: a random installation ID (a UUID, never derived from your
hardware), which middleware you've configured, SDK/Node version,
platform, and which CLI command ran.

Fully transparent, fully optional:

```bash
npx klaro telemetry status    # see exactly what's collected
npx klaro telemetry disable   # opt out -- the SDK stays fully functional
```

or set `KLARO_TELEMETRY=0` in your environment, which always overrides
`.klaro/config.json`. See [klaro.services/klaroshield/privacy](https://klaro.services/klaroshield/privacy) for the full policy.

## Middleware

- **`retries({ max, backoff, baseDelayMs, maxDelayMs, isRetryable })`** — exponential backoff with full jitter, retries only genuinely transient errors (429/5xx/network) by default.
- **`budget({ maxMonthlyUsd, onExceeded })`** — estimates cost from the provider's own `usage` field (OpenAI/Anthropic shapes both supported) against a small built-in pricing table, persists spend to `.klaro/budget.jsonl`.
- **`secrets({ mode })`** — deep-scans call args for OpenAI/Anthropic/AWS/GitHub keys and JWTs, masks or blocks.
- **`pii({ mode, types })`** — deep-scans for email/phone/SSN/credit card, masks or blocks.
- **`validation({ schema, extractText, maxRetries })`** — re-runs the call if the response doesn't parse as JSON or fails a Zod-compatible schema's `safeParse`.
- **`logging({ format })`** — `"pretty"` (colored stdout), `"json"`, or `"silent"` (still persists to `.klaro/logs.jsonl`, just doesn't print).

## License

MIT. Free for developers, free for commercial application development.
Klaro Cloud (project sync, team workspaces, remote config, shared
dashboards) is a separate, optional, proprietary service — the SDK never
requires it.
