export interface RedactionRule {
  name: string
  pattern: RegExp
  /** What to replace a match with -- e.g. "[REDACTED_EMAIL]". */
  replacement: string
}

export interface RedactionHit {
  rule: string
  /** Number of matches for this rule in this call, not the matched text itself -- the whole point of this middleware is to never persist the sensitive value anywhere, including in its own logs. */
  count: number
}

/**
 * Deep-walks an arbitrary JSON-like value (works for OpenAI's messages
 * array, Anthropic's messages, a plain string prompt, or a Vercel AI SDK
 * call's options object -- whatever shape the wrapped provider call
 * happens to take) and applies every rule to every string it finds.
 * Returns a new value (never mutates the input) plus a summary of what
 * was redacted, WITHOUT the matched values themselves.
 */
export function deepRedact<T>(value: T, rules: RedactionRule[]): { value: T; hits: RedactionHit[] } {
  const hitCounts = new Map<string, number>()

  function redactString(s: string): string {
    let out = s
    for (const rule of rules) {
      const matches = out.match(rule.pattern)
      if (matches && matches.length > 0) {
        hitCounts.set(rule.name, (hitCounts.get(rule.name) ?? 0) + matches.length)
        out = out.replace(rule.pattern, rule.replacement)
      }
    }
    return out
  }

  function walk(v: unknown): unknown {
    if (typeof v === "string") return redactString(v)
    if (Array.isArray(v)) return v.map(walk)
    if (v !== null && typeof v === "object") {
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v)) out[k] = walk(val)
      return out
    }
    return v
  }

  const redacted = walk(value) as T
  const hits = Array.from(hitCounts.entries()).map(([rule, count]) => ({ rule, count }))
  return { value: redacted, hits }
}
