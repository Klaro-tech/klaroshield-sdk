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

Every middleware runs entirely in-process. Nothing here calls out to a
KlaroShield server. `.klaro/` (created in your project root on first use)
holds local logs and spend records — inspect it with the CLI, or just read
the JSON Lines files directly.

## CLI

```bash
npx klaro init      # scaffold klaro.config.ts
npx klaro doctor     # check provider keys, env, local runtime health
npx klaro inspect    # recent requests: latency, redactions
npx klaro stats      # local spend + request counts
```

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
