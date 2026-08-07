import { findPricing, estimateCostUsd } from "./middleware/pricing-table.js"

export interface ProviderBenchmark {
  provider: string
  model: string
  ok: boolean
  latencyMs?: number
  costUsd?: number
  error?: string
}

export interface BenchmarkResult {
  results: ProviderBenchmark[]
  recommendation: { provider: string; model: string; reason: string } | null
}

const TEST_PROMPT = "Reply with exactly one short sentence confirming you received this test message."

/**
 * Reports the provider's own error message (e.g. "credit balance too
 * low") instead of just the HTTP status code -- confirmed live that a
 * bare "HTTP 400" is genuinely unhelpful for the two most common causes
 * (a billing issue vs. a real bad request look identical as just "400"
 * but need completely different fixes).
 */
async function errorMessageFrom(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; message?: string }
    const message = typeof body.error === "string" ? body.error : body.error?.message ?? body.message
    return message ? `HTTP ${res.status} — ${message}` : `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

async function benchmarkOpenAI(model: string): Promise<ProviderBenchmark> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { provider: "OpenAI", model, ok: false, error: "OPENAI_API_KEY not set" }
  const start = Date.now()
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: TEST_PROMPT }], max_tokens: 50 }),
    })
    const latencyMs = Date.now() - start
    if (!res.ok) return { provider: "OpenAI", model, ok: false, error: await errorMessageFrom(res) }
    const body = (await res.json()) as { usage?: { prompt_tokens: number; completion_tokens: number } }
    const pricing = findPricing(model)
    const costUsd = body.usage && pricing ? estimateCostUsd({ inputTokens: body.usage.prompt_tokens, outputTokens: body.usage.completion_tokens, model }) ?? undefined : undefined
    return { provider: "OpenAI", model, ok: true, latencyMs, costUsd }
  } catch (e) {
    return { provider: "OpenAI", model, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function benchmarkAnthropic(model: string): Promise<ProviderBenchmark> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { provider: "Claude", model, ok: false, error: "ANTHROPIC_API_KEY not set" }
  const start = Date.now()
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 50, messages: [{ role: "user", content: TEST_PROMPT }] }),
    })
    const latencyMs = Date.now() - start
    if (!res.ok) return { provider: "Claude", model, ok: false, error: await errorMessageFrom(res) }
    const body = (await res.json()) as { usage?: { input_tokens: number; output_tokens: number } }
    const pricing = findPricing(model)
    const costUsd = body.usage && pricing ? estimateCostUsd({ inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens, model }) ?? undefined : undefined
    return { provider: "Claude", model, ok: true, latencyMs, costUsd }
  } catch (e) {
    return { provider: "Claude", model, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// Gemini isn't in the SDK's pricing table (no model in PRICING_TABLE
// matches its naming) -- latency is still real and reported, cost is
// honestly reported as unavailable rather than guessed.
async function benchmarkGemini(model: string): Promise<ProviderBenchmark> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return { provider: "Gemini", model, ok: false, error: "GEMINI_API_KEY not set" }
  const start = Date.now()
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: TEST_PROMPT }] }] }),
    })
    const latencyMs = Date.now() - start
    if (!res.ok) return { provider: "Gemini", model, ok: false, error: await errorMessageFrom(res) }
    return { provider: "Gemini", model, ok: true, latencyMs } // no cost estimate -- not in the pricing table
  } catch (e) {
    return { provider: "Gemini", model, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// No API key at all -- genuinely local compute, genuinely $0 marginal
// cost, not an estimate standing in for "n/a." Ollama's default port
// (11434) is a fixed convention, not something worth making configurable
// here; a short connect timeout keeps this from hanging the whole
// benchmark for users who don't run Ollama at all.
async function benchmarkOllama(model: string): Promise<ProviderBenchmark> {
  const start = Date.now()
  try {
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: TEST_PROMPT, stream: false }),
      signal: AbortSignal.timeout(3000),
    })
    const latencyMs = Date.now() - start
    if (!res.ok) return { provider: "Ollama", model, ok: false, error: await errorMessageFrom(res) }
    return { provider: "Ollama", model, ok: true, latencyMs, costUsd: 0 }
  } catch (e) {
    // Node's fetch wraps the real reason in `.cause` (e.g. AggregateError
    // [ECONNREFUSED]) -- the top-level message is just the unhelpful
    // "fetch failed" confirmed live, so the cause has to be inspected
    // directly rather than string-matching the outer message.
    const cause = e instanceof Error ? (e.cause as { code?: string; name?: string } | undefined) : undefined
    const isConnectionRefused = cause?.code === "ECONNREFUSED" || (e instanceof Error && e.name === "TimeoutError")
    const message = e instanceof Error ? e.message : String(e)
    return { provider: "Ollama", model, ok: false, error: isConnectionRefused ? "not running locally (expected on :11434)" : message }
  }
}

/**
 * Sends the same short real prompt to every provider with a configured
 * key, measures real latency, and estimates real cost from the actual
 * usage each provider returns -- not simulated numbers. Providers without
 * a key set are reported as skipped, not silently omitted, so the output
 * is honest about what it could and couldn't measure.
 */
export async function benchmark(): Promise<BenchmarkResult> {
  const results = await Promise.all([
    benchmarkOpenAI("gpt-4o-mini"),
    benchmarkAnthropic("claude-3-5-haiku-latest"),
    benchmarkGemini("gemini-1.5-flash"),
    benchmarkOllama("llama3.2"),
  ])

  const ranked = results.filter((r) => r.ok && r.costUsd !== undefined)
  const cheapest = ranked.sort((a, b) => (a.costUsd ?? 0) - (b.costUsd ?? 0))[0]

  return {
    results,
    recommendation: cheapest
      ? { provider: cheapest.provider, model: cheapest.model, reason: `lowest cost per call among providers with a configured key ($${cheapest.costUsd?.toFixed(4)})` }
      : null,
  }
}
