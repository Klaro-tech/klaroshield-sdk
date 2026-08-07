import { existsSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { join } from "node:path"
import pc from "picocolors"
import { simulate as runSimulation, ALL_SCENARIOS, type SimulationScenario } from "../../simulate.js"
import type { Klaro } from "../../klaro.js"

const SCENARIO_LABELS: Record<SimulationScenario, string> = {
  rate_limit: "429 Rate Limit",
  server_error: "500 Server Error",
  timeout: "Timeout",
  bad_json: "Bad JSON",
  prompt_injection: "Prompt Injection",
  huge_prompt: "Huge Prompt",
}

/**
 * `klaro simulate` runs against the DEVELOPER'S OWN configured pipeline
 * (imported from klaro.config.js in their project), not a generic
 * default -- the whole point is showing what THEIR retry/budget/redaction
 * settings actually do under failure, not a demo of the SDK in the
 * abstract. Requires a compiled/plain-JS config (klaro.config.js) since
 * this CLI has no TypeScript loader of its own to pull in a .ts file --
 * `klaro init` scaffolds .ts for editor ergonomics, so a TS project needs
 * to either compile it or run this via `node --import tsx`.
 */
export async function simulate(): Promise<void> {
  const jsPath = join(process.cwd(), "klaro.config.js")
  const tsPath = join(process.cwd(), "klaro.config.ts")

  if (!existsSync(jsPath)) {
    if (existsSync(tsPath)) {
      console.log(
        "Found klaro.config.ts but this CLI can't import TypeScript directly.\n" +
          "Run this command via `node --import tsx node_modules/.bin/klaro simulate` instead, " +
          "or compile your config to klaro.config.js first."
      )
    } else {
      console.log("No klaro.config.js found in this directory. Run `klaro init` first.")
    }
    return
  }

  const mod = await import(pathToFileURL(jsPath).href)
  const klaro = mod.klaro as Klaro | undefined
  if (!klaro) {
    console.log('klaro.config.js was found but does not export a "klaro" instance. See the file `klaro init` scaffolds for the expected shape.')
    return
  }

  console.log(`${pc.bold("klaro simulate")} — testing your configured pipeline against common failure modes\n`)

  for (const scenario of ALL_SCENARIOS) {
    const result = await runSimulation(klaro, scenario)
    const icon = result.ok ? pc.green("✓") : pc.red("✗")
    console.log(`${icon} ${SCENARIO_LABELS[scenario].padEnd(20)} ${result.outcome} (${result.durationMs}ms)`)
  }

  console.log(pc.dim("\nThis ran real synthetic calls through your actual retries()/budget()/secrets()/pii()/validation() config -- not a mock of what they'd do."))
}
