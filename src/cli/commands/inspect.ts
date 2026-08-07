import { readJsonLines } from "../../storage/local-store.js"

interface LogRecord {
  callId: string
  attempt: number
  durationMs: number
  ok: boolean
  error?: string
  secretHits?: { rule: string; count: number }[]
  piiHits?: { rule: string; count: number }[]
  timestamp: string
}

export function inspect(limit: number): void {
  const logs = readJsonLines<LogRecord>("logs")
  if (logs.length === 0) {
    console.log("No calls recorded yet in .klaro/logs.jsonl.")
    return
  }

  const recent = logs.slice(-limit).reverse()
  console.log(`\x1b[1mklaroshield inspect\x1b[0m — last ${recent.length} of ${logs.length} call(s)\n`)

  for (const r of recent) {
    const status = r.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"
    const time = new Date(r.timestamp).toLocaleTimeString()
    const attemptStr = r.attempt > 1 ? ` (attempt ${r.attempt})` : ""
    console.log(`${status} ${time}  ${r.durationMs}ms${attemptStr}  ${r.callId.slice(0, 8)}`)
    if (r.error) console.log(`   \x1b[31merror:\x1b[0m ${r.error}`)
    if (r.secretHits?.length) console.log(`   \x1b[33msecrets redacted:\x1b[0m ${r.secretHits.map((h) => `${h.rule}×${h.count}`).join(", ")}`)
    if (r.piiHits?.length) console.log(`   \x1b[33mPII redacted:\x1b[0m ${r.piiHits.map((h) => `${h.rule}×${h.count}`).join(", ")}`)
  }
}
