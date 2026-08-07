import { describe, it, expect, afterEach, vi } from "vitest"
import { benchmark } from "./benchmark.js"

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.OPENAI_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.GEMINI_API_KEY
})

describe("benchmark", () => {
  it("reports every keyed provider as skipped when no keys are configured (Ollama, needing no key, may still respond if actually running locally)", async () => {
    const result = await benchmark()
    expect(result.results).toHaveLength(4)
    const keyed = result.results.filter((r) => r.provider !== "Ollama")
    expect(keyed.every((r) => !r.ok)).toBe(true)
  })

  it("recommends the cheapest of two successfully-benchmarked providers", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"

    // gpt-4o-mini is the cheapest model in the pricing table, so this mock
    // is set up to make OpenAI genuinely the correct winner given the
    // real pricing table -- not a hand-picked result.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("openai.com")) {
        return new Response(JSON.stringify({ usage: { prompt_tokens: 100, completion_tokens: 50 } }), { status: 200 })
      }
      if (url.includes("anthropic.com")) {
        return new Response(JSON.stringify({ usage: { input_tokens: 100, output_tokens: 50 } }), { status: 200 })
      }
      return new Response("not found", { status: 404 })
    }))

    const result = await benchmark()
    const openai = result.results.find((r) => r.provider === "OpenAI")
    const claude = result.results.find((r) => r.provider === "Claude")
    expect(openai?.ok).toBe(true)
    expect(claude?.ok).toBe(true)
    expect(openai!.costUsd!).toBeLessThan(claude!.costUsd!) // gpt-4o-mini really is cheaper than claude-3-5-haiku per the real pricing table
    expect(result.recommendation?.provider).toBe("OpenAI")
  })

  it("surfaces the provider's own error message, not just the HTTP status", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "Your credit balance is too low" } }), { status: 400 })
    ))

    const result = await benchmark()
    const claude = result.results.find((r) => r.provider === "Claude")
    expect(claude?.ok).toBe(false)
    expect(claude?.error).toContain("credit balance is too low")
  })
})
