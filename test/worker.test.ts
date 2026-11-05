import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TIMETABLE_KV_KEY } from "../src/kv.js";
import worker, { type Env } from "../src/worker.js";
import { FakeKv, loadFixture } from "./fixtures.js";

// Workers のエントリポイントを、ODPT への fetch と KV を差し替えて動かす

let kv: FakeKv;
let env: Env;
const odpt = vi.fn(async (_url: string) => Response.json(loadFixture()));

beforeEach(() => {
  kv = new FakeKv();
  env = { TIMETABLE: kv as unknown as KVNamespace, ODPT_CONSUMER_KEY: "test-key" };
  vi.stubGlobal("fetch", odpt);
});

afterEach(() => {
  vi.unstubAllGlobals();
  odpt.mockClear();
});

describe("worker", () => {
  it("scheduled: ダンプを取得してスナップショットを KV に保存する", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await worker.scheduled({} as ScheduledController, env);

    expect(odpt).toHaveBeenCalledWith(
      "https://api.odpt.org/api/v4/odpt:FlightSchedule.json?acl:consumerKey=test-key",
      expect.objectContaining({ redirect: "follow" }),
    );
    const snapshot = JSON.parse(kv.values.get(TIMETABLE_KV_KEY)!);
    expect(snapshot.formatVersion).toBe(1);
    expect(snapshot.excludedAirports).toEqual(["SIN"]);
  });

  it("fetch: KV が空でも、その場で作って MCP のリクエストに答える", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "get_route_timetable", arguments: { from: "HND", to: "FUK", date: "2026-11-04" } },
        }),
      }),
      env,
      {} as ExecutionContext,
    );
    const body = (await res.json()) as { result: { structuredContent: { flights: { flightNumber: string }[] } } };
    expect(body.result.structuredContent.flights.map((f) => f.flightNumber)).toEqual(["NH241", "JL305", "7G041", "JL4321"]);
    expect(odpt).toHaveBeenCalledOnce();
    expect(kv.values.has(TIMETABLE_KV_KEY)).toBe(true);
  });
});
