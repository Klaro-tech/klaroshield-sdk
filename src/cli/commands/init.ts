import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const TEMPLATE = `import { Klaro, retries, budget, secrets, pii, logging } from "@klaroshield/sdk";

// Scaffolded by \`klaro init\`. No cloud account needed -- everything here
// runs locally. Import \`klaro\` wherever you currently call your provider
// SDK directly, and wrap the call: export const chat = klaro.wrap(openai.chat.completions.create).
export const klaro = new Klaro()
  .use(retries({ max: 3, backoff: "exponential" }))
  .use(budget({ maxMonthlyUsd: 50 }))
  .use(secrets({ mode: "mask" }))
  .use(pii({ mode: "mask", types: ["email", "phone", "ssn", "credit_card"] }))
  .use(logging({ format: "pretty" }));
`

export function init(): void {
  const path = join(process.cwd(), "klaro.config.ts")
  if (existsSync(path)) {
    console.log(`\x1b[33m⚠\x1b[0m klaro.config.ts already exists — not overwriting.`)
    return
  }
  writeFileSync(path, TEMPLATE, "utf8")
  console.log("\x1b[32m✓\x1b[0m Created klaro.config.ts")
  console.log("\nNext step — wrap your existing AI call:\n")
  console.log("  import { klaro } from \"./klaro.config\";")
  console.log("  const chat = klaro.wrap(openai.chat.completions.create.bind(openai.chat.completions));")
  console.log("\nNo account, no API key, no cloud dependency required to use any of this.")
}
