import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { type CreateMcpServerOptions, createMcpServer } from "./mcp/server.js";
import type { TimetableDataset } from "./timetable/dataset.js";

export function createApp<Env extends object>(
  getDataset: (env: Env) => Promise<TimetableDataset>,
  options: CreateMcpServerOptions = {},
): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/health", async (c) => {
    try {
      const dataset = await getDataset(c.env);
      return c.json({ status: "ok", generatedAt: dataset.generatedAt });
    } catch {
      return c.json({ status: "unavailable" }, 503);
    }
  });

  // ステートレス構成: リクエストごとにサーバーとトランスポートを作り、JSON で応答する。
  // 読み取り専用のツールしかなく、セッションや通知を必要としないため。
  app.all("/mcp", async (c) => {
    const server = createMcpServer(() => getDataset(c.env), options);
    const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(c);
  });

  return app;
}
