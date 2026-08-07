import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"

// Same pattern as cli/commands/version.ts -- read from package.json at
// runtime rather than hardcoding the version a second time somewhere it
// can drift.
export function sdkVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    // dist/telemetry/version.js -> package.json is two levels up
    const pkgPath = join(here, "..", "..", "package.json")
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string }
    return pkg.version
  } catch {
    return "unknown"
  }
}
