import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { TimetableDataset } from "../src/timetable/dataset.js";
import { createSnapshot } from "../src/timetable/snapshot.js";
import { loadFixture } from "./fixtures.js";

// MCP クライアントと同じ形の JSON-RPC リクエストを Hono アプリに送る

// 2026-11-04 (水) 12:00 JST
const now = () => new Date("2026-11-04T03:00:00Z");
const dataset = new TimetableDataset(createSnapshot(loadFixture(), new Date("2026-11-04T00:00:00Z")));
const app = createApp(() => Promise.resolve(dataset), { now });

async function rpc(method: string, params?: unknown) {
  const res = await app.request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params !== undefined && { params }) }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { result?: any; error?: any };
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const { result } = await rpc("tools/call", { name, arguments: args });
  return result as { isError?: boolean; structuredContent?: any; content: { type: string; text: string }[] };
}

describe("MCP over HTTP", () => {
  it("5 つの読み取り専用ツールを公開する", async () => {
    const { result } = await rpc("tools/list");
    const tools = result.tools as { name: string; outputSchema?: unknown; annotations?: { readOnlyHint?: boolean } }[];
    expect(tools.map((t) => t.name)).toEqual([
      "search_airports",
      "list_routes",
      "get_route_timetable",
      "get_flight",
      "get_data_info",
    ]);
    for (const tool of tools) {
      expect(tool.outputSchema).toBeDefined();
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  it("get_route_timetable: 日付の例外を適用して出発時刻順に返す", async () => {
    const result = await callTool("get_route_timetable", { from: "羽田", to: "福岡" });
    expect(result.isError).toBeFalsy();
    const s = result.structuredContent;
    expect(s).toMatchObject({ date: "2026-11-04", weekday: "Wed", from: ["HND"], to: ["FUK"] });
    expect(s.flights.map((f: any) => [f.flightNumber, f.dep, f.arr, f.operatedBy])).toEqual([
      ["NH241", "07:30", "09:25", "ANA"],
      ["JL305", "08:10", "10:00", "JAL"],
      ["7G041", "08:30", "10:25", "SFJ"],
      ["JL4321", "12:00", "14:00", "FDA"],
    ]);
    expect(s.flights[0]).toMatchObject({ aircraft: ["789", "788"] });
    expect(s.flights[0]).not.toHaveProperty("codeshares");
    expect(s.flights[2]).toMatchObject({ codeshares: ["NH3841"] });
    expect(s.carriers).toEqual({ ANA: "全日本空輸", FDA: "フジドリームエアラインズ", JAL: "日本航空", SFJ: "スターフライヤー" });
    expect(s).not.toHaveProperty("warnings");
    expect(JSON.parse(result.content[0]!.text)).toEqual(s);
  });

  it("get_route_timetable: 時刻と航空会社で絞り込む", async () => {
    const result = await callTool("get_route_timetable", {
      from: "HND",
      to: "FUK",
      airline: "ANA",
      departAfter: "08:00",
    });
    expect(result.structuredContent.flights.map((f: any) => f.flightNumber)).toEqual(["7G041"]);
  });

  it("データ期間外の航空会社について警告する", async () => {
    const result = await callTool("get_route_timetable", { from: "HND", to: "FUK", date: "2026-12-02" });
    const s = result.structuredContent;
    expect(s.flights.map((f: any) => f.flightNumber)).toEqual(["JL305", "JL307", "JL4321"]);
    expect(s.warnings).toEqual([expect.stringContaining("outside the ANA timetable data (2026-10-25 to 2026-11-30)")]);
  });

  it("list_routes: 都市を展開し、国際線は含めない", async () => {
    const result = await callTool("list_routes", { from: "東京" });
    const s = result.structuredContent;
    expect(s.routes).toEqual([
      {
        from: "HND",
        to: "FUK",
        totalFlights: 4,
        airlines: [
          { airline: "JAL", flights: 2, first: "08:10", last: "12:00" },
          { airline: "ANA", flights: 2, first: "07:30", last: "08:30" },
        ],
        durationMin: { min: 110, max: 120 },
      },
    ]);
    expect(s.airports).toEqual({ FUK: "福岡", HND: "東京(羽田)", NRT: "成田" });
  });

  it("get_flight: コードシェア便名から運航便を引く", async () => {
    const result = await callTool("get_flight", { flightNumber: "NH3841" });
    const s = result.structuredContent;
    expect(s.flights).toHaveLength(1);
    expect(s.flights[0]).toMatchObject({ flightNumber: "7G041", operatedBy: "SFJ" });
    expect(s.periods).toEqual([
      {
        airline: "ANA",
        flightNumber: "7G041",
        from: "HND",
        to: "FUK",
        operatedBy: "SFJ",
        validFrom: "2026-10-25",
        validTo: "2026-11-30",
        weekdays: ["Wed"],
        dep: "08:30",
        arr: "10:25",
        aircraft: ["32P"],
      },
    ]);
  });

  it("get_flight: 曜日違いで同じ内容の便は 1 つの運航パターンにまとめる", async () => {
    const s = (await callTool("get_flight", { flightNumber: "JL305" })).structuredContent;
    expect(s.periods.map((p: any) => p.weekdays)).toEqual([["Wed", "Thu"]]);
  });

  it("get_flight: 運休日は flights が空で、運航パターンと備考は返す", async () => {
    const s = (await callTool("get_flight", { flightNumber: "JL307" })).structuredContent;
    expect(s.flights).toEqual([]);
    expect(s.periods[0]).toMatchObject({ weekdays: ["Wed"], note: "11/4・運休" });
  });

  it("search_airports: 都市名で複数空港を返す", async () => {
    const s = (await callTool("search_airports", { query: "東京" })).structuredContent;
    expect(s.cityGroup).toEqual({ code: "TYO", name: "東京", airports: ["HND", "NRT"] });
    expect(s.airports.map((a: any) => [a.code, a.airlines, a.destinations])).toEqual([
      ["HND", ["JAL", "ANA"], 1],
      ["NRT", [], 0],
    ]);
  });

  it("get_data_info: 航空会社ごとの提供期間を返す", async () => {
    const s = (await callTool("get_data_info")).structuredContent;
    expect(s.generatedAt).toBe("2026-11-04T00:00:00.000Z");
    expect(s.airlines).toEqual([
      { airline: "JAL", dataAsOf: "2026-08-21T13:00:00+09:00", coverage: { from: "2026-10-25", to: "2027-01-04" }, routes: 2 },
      { airline: "ANA", dataAsOf: "2026-10-08T09:00:00+09:00", coverage: { from: "2026-10-25", to: "2026-11-30" }, routes: 1 },
    ]);
  });

  it.each([
    ["get_route_timetable", { from: "大", to: "FUK" }, /ambiguous/],
    ["get_route_timetable", { from: "HND", to: "FUK", date: "2026-02-30" }, /Invalid date/],
    ["list_routes", { airline: "JAL" }, /at least one of from or to/],
    ["get_flight", { flightNumber: "JL9999" }, /not found/],
  ])("%s %j はツールエラーを返す", async (name, args, message) => {
    const result = await callTool(name, args);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(message);
  });
});
