import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"

// Reads the version from package.json at runtime rather than hardcoding it
// a second time in code -- a hardcoded string here would silently drift
// from package.json on the next release the moment someone forgets to
// update both places.
export function version(): void {
  const here = dirname(fileURLToPath(import.meta.url))
  // dist/cli/commands/version.js -> package.json is three levels up
  const pkgPath = join(here, "..", "..", "..", "package.json")
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name: string; version: string }
  console.log(`${pkg.name} v${pkg.version}`)
  console.log(`node ${process.version}`)
}
