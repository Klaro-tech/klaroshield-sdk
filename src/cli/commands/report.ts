import { writeFileSync } from "node:fs"
import pc from "picocolors"
import { generateReport, renderMarkdown, renderJson, renderHtml } from "../../report.js"
import { sendTelemetry } from "../../telemetry/send.js"

export type ReportFormat = "md" | "json" | "html"

function render(format: ReportFormat, data: ReturnType<typeof generateReport>): string {
  if (format === "json") return renderJson(data)
  if (format === "html") return renderHtml(data)
  return renderMarkdown(data)
}

export function report(options: { format?: string; out?: string }): void {
  sendTelemetry("report_run", { cliCommand: "report" })

  const format = (options.format ?? "md") as ReportFormat
  if (!["md", "json", "html"].includes(format)) {
    console.log(`${pc.red("✗")} Unknown format "${options.format}" -- use md, json, or html.`)
    return
  }

  const data = generateReport()
  const output = render(format, data)

  if (options.out) {
    writeFileSync(options.out, output, "utf8")
    console.log(`${pc.green("✓")} Report written to ${options.out}`)
  } else {
    console.log(output)
  }
}
