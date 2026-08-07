#!/usr/bin/env node
import { Command } from "commander"
import { doctor } from "./commands/doctor.js"
import { stats } from "./commands/stats.js"
import { inspect } from "./commands/inspect.js"
import { init } from "./commands/init.js"
import { version } from "./commands/version.js"
import { explain } from "./commands/explain.js"
import { simulate } from "./commands/simulate.js"

const program = new Command()

program
  .name("klaro")
  .description("KlaroShield CLI — local diagnostics for the AI runtime, no cloud account required.")
  .version("0.1.0")

program
  .command("init")
  .description("Scaffold a klaro.config.ts in the current project")
  .action(init)

program
  .command("doctor")
  .description("Check provider API keys, env vars, and local runtime health")
  .action(doctor)

program
  .command("inspect")
  .description("Show recent requests: latency, cost, redactions")
  .option("-n, --limit <n>", "number of recent calls to show", "10")
  .action((opts) => inspect(Number(opts.limit)))

program
  .command("stats")
  .description("Show local token spend and request counts by model")
  .action(stats)

program
  .command("version")
  .description("Show the installed klaroshield SDK/CLI version")
  .action(version)

program
  .command("explain [callId]")
  .description("Narrate what happened on a call (most recent by default) in plain language")
  .action((callId) => explain(callId))

program
  .command("simulate")
  .description("Run common failure modes (rate limits, timeouts, bad JSON, ...) through your configured pipeline")
  .action(simulate)

program.parse()
