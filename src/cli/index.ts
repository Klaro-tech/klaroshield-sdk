#!/usr/bin/env node
import { Command } from "commander"
import { doctor } from "./commands/doctor.js"
import { stats } from "./commands/stats.js"
import { inspect } from "./commands/inspect.js"
import { init } from "./commands/init.js"

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

program.parse()
