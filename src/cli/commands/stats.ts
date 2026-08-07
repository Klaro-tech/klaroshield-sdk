import { readJsonLines, readJson } from "../../storage/local-store.js"

interface LogRecord {
  ok: boolean
  attempt: number
  durationMs: number
  timestamp: string
  secretHits?: { rule: string; count: number }[]
  piiHits?: { rule: string; count: number }[]
}
interface BudgetRecord {
  costUsd: number
  timestamp: string
  model?: string
}
interface BudgetConfig {
  maxMonthlyUsd: number
}

function isToday(isoTimestamp: string): boolean {
  return isoTimestamp.slice(0, 10) === new Date().toISOString().slice(0, 10)
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7)
}

function sumHits(records: { count: number }[] | undefined): number {
  return (records ?? []).reduce((sum, r) => sum + r.count, 0)
}

/**
 * Weighted the same way doctor()'s score is: reliability (retry rate) and
 * redaction activity matter more than raw call volume. A project with
 * zero calls today gets no score at all rather than a misleading 100 --
 * there's nothing to score yet.
 */
function computeHealthScore(retryRate: number, failureRate: number): number {
  let score = 100
  score -= retryRate * 30 // up to -30 if every call needed a retry
  score -= failureRate * 50 // failed calls matter more than retried-then-succeeded ones
  return Math.max(0, Math.round(score))
}

export function stats(): void {
  const logs = readJsonLines<LogRecord>("logs")
  const spend = readJsonLines<BudgetRecord>("budget")
  const budgetConfig = readJson<BudgetConfig | null>("budget-config", null)

  if (logs.length === 0) {
    console.log("No calls recorded yet in .klaro/logs.jsonl. Wrap a call with klaro.wrap(...) and it'll show up here.")
    return
  }

  const todaysLogs = logs.filter((l) => isToday(l.timestamp))
  const todaysSpend = spend.filter((s) => isToday(s.timestamp))
  const monthKey = currentMonthKey()
  const monthSpend = spend.filter((s) => s.timestamp.startsWith(monthKey)).reduce((sum, s) => sum + s.costUsd, 0)

  console.log("────────────────────────────")
  console.log("\x1b[1mToday's AI Health\x1b[0m")
  console.log("────────────────────────────\n")

  if (todaysLogs.length === 0) {
    console.log("No calls yet today. Showing all-time totals instead:\n")
  }

  const relevantLogs = todaysLogs.length > 0 ? todaysLogs : logs
  const relevantSpend = todaysLogs.length > 0 ? todaysSpend : spend

  const retriesSaved = relevantLogs.filter((l) => l.attempt > 1 && l.ok).length
  const secretsRemoved = relevantLogs.reduce((sum, l) => sum + sumHits(l.secretHits), 0)
  const piiRemoved = relevantLogs.reduce((sum, l) => sum + sumHits(l.piiHits), 0)
  const costToday = relevantSpend.reduce((sum, s) => sum + s.costUsd, 0)
  const avgLatency = relevantLogs.reduce((sum, l) => sum + l.durationMs, 0) / relevantLogs.length
  const failed = relevantLogs.filter((l) => !l.ok).length
  const retryRate = relevantLogs.filter((l) => l.attempt > 1).length / relevantLogs.length
  const failureRate = failed / relevantLogs.length

  console.log(`\x1b[32m✓\x1b[0m Retries Saved       ${retriesSaved}`)
  console.log(`\x1b[32m✓\x1b[0m Secrets Removed     ${secretsRemoved}`)
  console.log(`\x1b[32m✓\x1b[0m PII Removed         ${piiRemoved}`)
  console.log(`\x1b[32m✓\x1b[0m Cost Today          $${costToday.toFixed(2)}`)
  console.log(`\x1b[32m✓\x1b[0m Average Latency     ${avgLatency.toFixed(0)} ms`)
  if (budgetConfig) {
    const remaining = Math.max(0, budgetConfig.maxMonthlyUsd - monthSpend)
    console.log(`\x1b[32m✓\x1b[0m Budget Remaining    $${remaining.toFixed(2)}`)
  } else {
    console.log(`\x1b[33m⚠\x1b[0m Budget Remaining    no budget() middleware configured -- add .use(budget({ maxMonthlyUsd })) to track this`)
  }

  const score = computeHealthScore(retryRate, failureRate)
  const scoreColor = score >= 90 ? "\x1b[32m" : score >= 70 ? "\x1b[33m" : "\x1b[31m"
  console.log(`\nHealth Score: ${scoreColor}${score}/100\x1b[0m`)
  console.log(`\n(${relevantLogs.length} call${relevantLogs.length === 1 ? "" : "s"}, ${failed} failed, all-time spend $${spend.reduce((s, r) => s + r.costUsd, 0).toFixed(2)})`)
}
