import { existsSync } from "node:fs"
import { join } from "node:path"

interface Check {
  name: string
  ok: boolean
  detail: string
}

// Checks the well-known env var names for the providers this SDK's
// middleware/pricing table actually knows about (OpenAI, Anthropic) --
// not an exhaustive list of every possible LLM provider, since this is a
// "does your basic setup look sane" check, not a provider registry.
function checkProviderKeys(): Check[] {
  const checks: Check[] = []
  const openaiKey = process.env.OPENAI_API_KEY
  checks.push({
    name: "OPENAI_API_KEY",
    ok: Boolean(openaiKey),
    detail: openaiKey ? `set (${openaiKey.slice(0, 7)}...)` : "not set",
  })
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  checks.push({
    name: "ANTHROPIC_API_KEY",
    ok: Boolean(anthropicKey),
    detail: anthropicKey ? `set (${anthropicKey.slice(0, 10)}...)` : "not set",
  })
  return checks
}

function checkKlaroDir(): Check {
  const dir = join(process.cwd(), ".klaro")
  return {
    name: ".klaro/ local storage",
    ok: existsSync(dir),
    detail: existsSync(dir) ? "exists (logs/budget will accumulate here)" : "not yet created — will be created on first wrapped call",
  }
}

function checkNodeVersion(): Check {
  const major = Number(process.versions.node.split(".")[0])
  return {
    name: "Node.js version",
    ok: major >= 18,
    detail: `v${process.versions.node}${major >= 18 ? "" : " — klaroshield requires Node 18+"}`,
  }
}

export function doctor(): void {
  console.log("\x1b[1mklaroshield doctor\x1b[0m\n")
  const checks = [checkNodeVersion(), ...checkProviderKeys(), checkKlaroDir()]

  for (const c of checks) {
    const icon = c.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[33m⚠\x1b[0m"
    console.log(`${icon} ${c.name.padEnd(24)} ${c.detail}`)
  }

  const failed = checks.filter((c) => !c.ok && c.name !== ".klaro/ local storage")
  console.log()
  if (failed.length === 0) {
    console.log("\x1b[32mLooking good.\x1b[0m No provider API key is required by klaroshield itself -- it wraps whatever call you already have -- but at least one should be set for your own app to work.")
  } else {
    console.log(`${failed.length} item(s) worth a look above. Neither is required by klaroshield itself -- this just flags things your AI calls likely need.`)
  }
}
