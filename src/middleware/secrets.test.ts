import { describe, it, expect } from "vitest"
import { Klaro } from "../klaro.js"
import { secrets } from "./secrets.js"

describe("secrets middleware", () => {
  it("redacts secrets in the outbound request", async () => {
    const klaro = new Klaro().use(secrets({ mode: "mask" }))
    const wrapped = klaro.wrap(async (arg: { text: string }) => ({ echo: arg.text }))
    const result = await wrapped({ text: "key sk-abcdefghijklmnopqrstuvwxyz123456" })
    expect(result.echo).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456")
    expect(result.echo).toContain("[REDACTED_OPENAI_KEY]")
  })

  it("redacts secrets in the provider's response, not just the request", async () => {
    const klaro = new Klaro().use(secrets({ mode: "mask" }))
    const wrapped = klaro.wrap(async () => ({
      choices: [{ message: { content: "Your key is sk-ABCDEF1234567890ABCDEF1234567890" } }],
    }))
    const result = await wrapped()
    const text = result.choices[0].message.content
    expect(text).not.toContain("sk-ABCDEF1234567890ABCDEF1234567890")
    expect(text).toContain("[REDACTED_OPENAI_KEY]")
  })

  it("block mode throws on a secret found in the response", async () => {
    const klaro = new Klaro().use(secrets({ mode: "block" }))
    const wrapped = klaro.wrap(async () => ({ text: "AKIAABCDEFGHIJKLMNOP" }))
    await expect(wrapped()).rejects.toThrow(/secret\(s\) detected in the provider's response/)
  })
})
