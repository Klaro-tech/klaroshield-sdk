// Approximate $/1M tokens, input and output priced separately since they
// differ 3-5x on every major provider. "Approximate" is explicit here --
// this table will drift as providers reprice; budget() treats it as an
// estimate for a soft spending cap, never a billing-accurate figure. Keyed
// by substring match against whatever model name the provider's response
// includes (e.g. "gpt-4o-2024-08-06" matches "gpt-4o"), so this doesn't
// need to track every dated model snapshot.
export const PRICING_TABLE: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "gpt-4-turbo": { inputPer1M: 10, outputPer1M: 30 },
  "gpt-3.5-turbo": { inputPer1M: 0.5, outputPer1M: 1.5 },
  "claude-3-5-sonnet": { inputPer1M: 3, outputPer1M: 15 },
  "claude-3-5-haiku": { inputPer1M: 0.8, outputPer1M: 4 },
  "claude-3-opus": { inputPer1M: 15, outputPer1M: 75 },
}

export function findPricing(modelName: string | undefined): { inputPer1M: number; outputPer1M: number } | null {
  if (!modelName) return null
  const key = Object.keys(PRICING_TABLE).find((k) => modelName.includes(k))
  return key ? PRICING_TABLE[key] : null
}

/**
 * Best-effort usage extraction across the three shapes actually seen in
 * the wild: OpenAI's {usage: {prompt_tokens, completion_tokens}}, the
 * newer {usage: {input_tokens, output_tokens}} some SDKs (and Anthropic)
 * use, and a flat {usage: {total_tokens}} fallback that can't split
 * input/output (treated as all-output for a conservative overestimate,
 * since output tokens cost more).
 */
export function extractUsage(result: unknown): { inputTokens: number; outputTokens: number; model?: string } | null {
  if (typeof result !== "object" || result === null) return null
  const r = result as Record<string, unknown>
  const usage = r.usage as Record<string, unknown> | undefined
  const model = typeof r.model === "string" ? r.model : undefined
  if (!usage) return null

  if (typeof usage.prompt_tokens === "number" && typeof usage.completion_tokens === "number") {
    return { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, model }
  }
  if (typeof usage.input_tokens === "number" && typeof usage.output_tokens === "number") {
    return { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, model }
  }
  if (typeof usage.total_tokens === "number") {
    return { inputTokens: 0, outputTokens: usage.total_tokens, model }
  }
  return null
}

export function estimateCostUsd(usage: { inputTokens: number; outputTokens: number; model?: string }): number | null {
  const pricing = findPricing(usage.model)
  if (!pricing) return null
  return (usage.inputTokens / 1_000_000) * pricing.inputPer1M + (usage.outputTokens / 1_000_000) * pricing.outputPer1M
}
