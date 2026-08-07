import { existsSync } from "node:fs"
import { join } from "node:path"
import { readJsonLines } from "../../storage/local-store.js"
import { PRICING_TABLE, findPricing } from "../../middleware/pricing-table.js"

interface Check {
  name: string
  ok: boolean
  warn?: boolean
  detail: string
}

interface LogRecord {
  ok: boolean
  attempt: number
  timestamp: string
}
interface BudgetRecord {
  costUsd: number
  timestamp: string
  model?: string
}

// A real GET against each provider's own lightweight list/models endpoint
// -- costs nothing (no completion is generated), just proves the key
// authenticates. Only runs when the key is actually set; an unset key is
// reported as "not configured," not as a failed connection attempt.
async function checkProviderConnection(name: string, envVar: string, url: string, headers: (key: string) => Record<string, string>): Promise<Check> {
  const key = process.env[envVar]
  if (!key) return { name: `${name} Connected`, ok: false, warn: true, detail: `${envVar} not set` }
  try {
    const res = await fetch(url, { headers: headers(key) })
    if (res.ok) return { name: `${name} Connected`, ok: true, detail: "authenticated" }
    if (res.status === 401 || res.status === 403) return { name: `${name} Connected`, ok: false, detail: `${envVar} is set but was rejected (${res.status}) -- check the key is valid` }
    return { name: `${name} Connected`, ok: false, warn: true, detail: `unexpected response (${res.status})` }
  } catch (e) {
    return { name: `${name} Connected`, ok: false, warn: true, detail: `network error -- ${e instanceof Error ? e.message : String(e)}` }
  }
}

function checkNodeVersion(): Check {
  const major = Number(process.versions.node.split(".")[0])
  return {
    name: "Node.js version",
    ok: major >= 18,
    detail: `v${process.versions.node}${major >= 18 ? "" : " — klaroshield requires Node 18+"}`,
  }
}

function checkKlaroDir(): Check {
  const dir = join(process.cwd(), ".klaro")
  return {
    name: ".klaro/ local storage",
    ok: existsSync(dir),
    warn: !existsSync(dir),
    detail: existsSync(dir) ? "exists" : "not yet created — will be created on first wrapped call",
  }
}

/**
 * Reads recent call history to judge whether retries are actually helping
 * or just burning time -- a retry policy that needs 3+ attempts on most
 * calls is a real signal something upstream (rate limits, a too-small
 * model) needs attention, not just "retries are configured."
 */
function checkRetryHealth(): Check {
  const logs = readJsonLines<LogRecord>("logs")
  if (logs.length === 0) return { name: "Retry Policy", ok: true, warn: true, detail: "no calls recorded yet — nothing to judge" }

  const multiAttempt = logs.filter((l) => l.attempt > 1)
  const rate = multiAttempt.length / logs.length
  if (rate > 0.3) {
    return {
      name: "Retry Policy",
      ok: false,
      detail: `${(rate * 100).toFixed(0)}% of calls needed a retry — high enough to suggest an upstream problem (rate limits, model overload), not just noise`,
    }
  }
  return { name: "Retry Policy", ok: true, detail: `${(rate * 100).toFixed(0)}% of calls needed a retry — healthy` }
}

interface CostRecommendation {
  currentModel: string
  suggestedModel: string
  currentCostUsd: number
  suggestedCostUsd: number
  savingsPct: number
}

/**
 * Looks at real recorded spend per model and checks whether a cheaper
 * model in the same "family" (same provider, cheaper $/1M tokens) was
 * used for a meaningful volume of calls -- a real, evidence-based
 * recommendation grounded in this project's actual usage, not a generic
 * "you could save money" nag.
 */
function findCostRecommendation(): CostRecommendation | null {
  const spend = readJsonLines<BudgetRecord>("budget")
  if (spend.length < 5) return null // not enough real usage to recommend anything responsibly

  const byModel = new Map<string, { count: number; totalCost: number }>()
  for (const s of spend) {
    if (!s.model) continue
    const entry = byModel.get(s.model) ?? { count: 0, totalCost: 0 }
    entry.count++
    entry.totalCost += s.costUsd
    byModel.set(s.model, entry)
  }

  let best: CostRecommendation | null = null
  for (const [model, usage] of byModel) {
    const current = findPricing(model)
    if (!current) continue
    for (const [candidateName, candidatePricing] of Object.entries(PRICING_TABLE)) {
      if (candidateName === model) continue
      const isCheaper = candidatePricing.outputPer1M < current.outputPer1M
      if (!isCheaper) continue
      const avgCostPerCall = usage.totalCost / usage.count
      const estimatedSavingsPct = 1 - candidatePricing.outputPer1M / current.outputPer1M
      const monthlySavings = usage.totalCost * estimatedSavingsPct
      if (!best || monthlySavings > best.currentCostUsd - best.suggestedCostUsd) {
        best = {
          currentModel: model,
          suggestedModel: candidateName,
          currentCostUsd: usage.totalCost,
          suggestedCostUsd: usage.totalCost * (1 - estimatedSavingsPct),
          savingsPct: estimatedSavingsPct * 100,
        }
      }
    }
  }
  return best
}

function computeHealthScore(checks: Check[]): number {
  // Weighted, not a plain pass/warn/fail average -- a missing provider key
  // (warn) shouldn't cost as much as a genuinely failed connection (fail),
  // and Node version / .klaro dir are minor relative to whether calls
  // actually work.
  let score = 100
  for (const c of checks) {
    if (c.ok) continue
    score -= c.warn ? 5 : 15
  }
  return Math.max(0, Math.round(score))
}

export async function doctor(): Promise<void> {
  console.log("────────────────────────────")
  console.log("\x1b[1mAI Runtime Health\x1b[0m")
  console.log("────────────────────────────\n")

  const checks: Check[] = [
    checkNodeVersion(),
    await checkProviderConnection("OpenAI", "OPENAI_API_KEY", "https://api.openai.com/v1/models", (k) => ({ Authorization: `Bearer ${k}` })),
    await checkProviderConnection("Claude", "ANTHROPIC_API_KEY", "https://api.anthropic.com/v1/models", (k) => ({ "x-api-key": k, "anthropic-version": "2023-06-01" })),
    await checkProviderConnection("Gemini", "GEMINI_API_KEY", "https://generativelanguage.googleapis.com/v1beta/models", (k) => ({ "x-goog-api-key": k })),
    checkRetryHealth(),
    checkKlaroDir(),
  ]

  for (const c of checks) {
    const icon = c.ok ? "\x1b[32m✓\x1b[0m" : c.warn ? "\x1b[33m⚠\x1b[0m" : "\x1b[31m✗\x1b[0m"
    console.log(`${icon} ${c.name.padEnd(24)} ${c.detail}`)
  }

  const recommendation = findCostRecommendation()
  if (recommendation) {
    console.log(`\n\x1b[33m⚠\x1b[0m ${recommendation.currentModel} costs ${recommendation.savingsPct.toFixed(0)}% more than ${recommendation.suggestedModel} for comparable output`)
    console.log(`   Potential savings: $${(recommendation.currentCostUsd - recommendation.suggestedCostUsd).toFixed(2)} based on your recorded usage`)
  }

  const score = computeHealthScore(checks)
  const scoreColor = score >= 90 ? "\x1b[32m" : score >= 70 ? "\x1b[33m" : "\x1b[31m"
  console.log(`\nHealth Score: ${scoreColor}${score}/100\x1b[0m`)
}
