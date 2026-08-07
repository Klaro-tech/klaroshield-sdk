import { readJsonLines } from "../../storage/local-store.js"

interface LogRecord {
  ok: boolean
  durationMs: number
  timestamp: string
}
interface BudgetRecord {
  costUsd: number
  timestamp: string
}

export function stats(): void {
  const logs = readJsonLines<LogRecord>("logs")
  const spend = readJsonLines<BudgetRecord>("budget")

  if (logs.length === 0) {
    console.log("No calls recorded yet in .klaro/logs.jsonl. Wrap a call with klaro.wrap(...) and it'll show up here.")
    return
  }

  const ok = logs.filter((l) => l.ok).length
  const failed = logs.length - ok
  const avgMs = logs.reduce((sum, l) => sum + l.durationMs, 0) / logs.length
  const totalSpend = spend.reduce((sum, s) => sum + s.costUsd, 0)

  const now = new Date()
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
  const monthSpend = spend
    .filter((s) => s.timestamp.startsWith(monthKey))
    .reduce((sum, s) => sum + s.costUsd, 0)

  console.log("\x1b[1mklaroshield stats\x1b[0m\n")
  console.log(`Total calls:       ${logs.length} (${ok} ok, ${failed} failed)`)
  console.log(`Avg latency:       ${avgMs.toFixed(0)}ms`)
  console.log(`Spend (all-time):  $${totalSpend.toFixed(4)}`)
  console.log(`Spend (this month): $${monthSpend.toFixed(4)}`)
}
