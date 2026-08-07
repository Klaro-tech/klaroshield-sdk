import { createServer, type Server } from "node:http"
import { loadDashboardData } from "./data.js"
import { renderPage } from "./page.js"

export function startDashboardServer(port: number): Server {
  const server = createServer((req, res) => {
    if (req.url === "/api/data") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" })
      res.end(JSON.stringify(loadDashboardData()))
      return
    }
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(renderPage())
      return
    }
    res.writeHead(404, { "Content-Type": "text/plain" })
    res.end("Not found")
  })

  server.listen(port)
  return server
}
