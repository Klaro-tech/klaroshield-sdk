import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { rmSync, existsSync } from "node:fs"
import { Klaro } from "../../klaro.js"
import { retries } from "../../middleware/retries.js"
import { logging } from "../../middleware/logging.js"
import { explain } from "./explain.js"

const KLARO_DIR = new URL("../../../.klaro", import.meta.url).pathname

beforeEach(() => {
  if (existsSync(KLARO_DIR)) rmSync(KLARO_DIR, { recursive: true, force: true })
})
afterEach(() => {
  if (existsSync(KLARO_DIR)) rmSync(KLARO_DIR, { recursive: true, force: true })
})

describe("explain", () => {
  it("shows every attempt for a retried call, not just the first one logged", async () => {
    // retries() sits outside logging() -- the whole inner chain (including
    // logging()) runs once per attempt, so one callId can have multiple
    // log records. This is the exact bug found while building the
    // feature: an earlier version used .find() and returned the first
    // (failed) attempt instead of the real outcome.
    const klaro = new Klaro().use(retries({ max: 3, baseDelayMs: 1 })).use(logging({ format: "silent" }))
    let attempts = 0
    const wrapped = klaro.wrap(async () => {
      attempts++
      if (attempts < 2) {
        const err: any = new Error("rate limited")
        err.status = 429
        throw err
      }
      return "ok"
    })
    await wrapped()

    const lines: string[] = []
    const spy = vi.spyOn(console, "log").mockImplementation((msg: string) => {
      lines.push(msg)
    })
    explain()
    spy.mockRestore()

    const output = lines.join("\n")
    expect(output).toContain("rate limited")
    expect(output).toContain("Succeeded")
    expect(output).toContain("2 attempts")
    expect(output).toContain("succeeded")
  })
})
