import { defineConfig } from "vitest/config"

// Every test file's beforeEach/afterEach reads and rmSync's the SAME
// .klaro/ directory (relative to process.cwd(), which local-store.ts
// hardcodes -- correct for the real SDK, but means test files racing in
// parallel can rmSync a directory another file is mid-write to).
// Confirmed live: an intermittent failure in explain.test.ts that
// disappeared on rerun, classic parallel-race signature. Disabling file
// parallelism trades a small amount of speed (this suite runs in well
// under a second either way) for eliminating the whole bug class, rather
// than restructuring every test file to use an isolated cwd.
export default defineConfig({
  test: {
    fileParallelism: false,
  },
})
