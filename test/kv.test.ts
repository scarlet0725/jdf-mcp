import { afterEach, describe, expect, it, vi } from "vitest";
import { TIMETABLE_KV_KEY, TimetableCache, saveSnapshot } from "../src/kv.js";
import { createSnapshot } from "../src/timetable/snapshot.js";
import { FakeKv, loadFixture } from "./fixtures.js";

const snapshotAt = (iso: string) => createSnapshot(loadFixture(), new Date(iso));

function setup() {
  let now = 0;
  const kv = new FakeKv();
  const cache = new TimetableCache({ ttlMs: 1000, retryMs: 3000, now: () => now });
  const build = vi.fn(async () => snapshotAt("2026-11-04T00:00:00Z"));
  return { kv, cache, build, advance: (ms: number) => (now += ms) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TimetableCache", () => {
  it("KV が空なら作って保存する", async () => {
    const { kv, cache, build } = setup();
    const dataset = await cache.get(kv, build);
    expect(build).toHaveBeenCalledOnce();
    expect(dataset.generatedAt).toBe("2026-11-04T00:00:00.000Z");
    expect(JSON.parse(kv.values.get(TIMETABLE_KV_KEY)!)).toMatchObject({ formatVersion: 1 });
  });

  it("同時に来た読み込みは 1 回にまとめる", async () => {
    const { kv, cache, build } = setup();
    const [a, b] = await Promise.all([cache.get(kv, build), cache.get(kv, build)]);
    expect(a).toBe(b);
    expect(build).toHaveBeenCalledOnce();
  });

  it("TTL の間は KV を読まず、過ぎたら内容が変わったときだけ読み直す", async () => {
    const { kv, cache, build, advance } = setup();
    await saveSnapshot(kv, snapshotAt("2026-11-04T00:00:00Z"));
    const first = await cache.get(kv, build);
    expect(await cache.get(kv, build)).toBe(first);
    expect(kv.reads).toBe(1);

    advance(1000);
    expect(await cache.get(kv, build)).toBe(first);
    expect(kv.reads).toBe(2);

    await saveSnapshot(kv, snapshotAt("2026-11-04T06:00:00Z"));
    advance(1000);
    const refreshed = await cache.get(kv, build);
    expect(refreshed).not.toBe(first);
    expect(refreshed.generatedAt).toBe("2026-11-04T06:00:00.000Z");
    expect(build).not.toHaveBeenCalled();
  });

  it("KV から消えても、読み込み済みのデータを使い続ける", async () => {
    const { kv, cache, build, advance } = setup();
    await saveSnapshot(kv, snapshotAt("2026-11-04T00:00:00Z"));
    const first = await cache.get(kv, build);
    kv.values.clear();
    advance(1000);
    expect(await cache.get(kv, build)).toBe(first);
    expect(build).not.toHaveBeenCalled();
  });
});

describe("TimetableCache: 障害時", () => {
  it("KV への保存に失敗しても、作ったデータを返す", async () => {
    const { kv, cache, build } = setup();
    vi.spyOn(kv, "put").mockRejectedValue(new Error("KV PUT failed: 429 Too Many Requests"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const dataset = await cache.get(kv, build);
    expect(dataset.generatedAt).toBe("2026-11-04T00:00:00.000Z");
    expect(await cache.get(kv, build)).toBe(dataset);
    expect(build).toHaveBeenCalledOnce();
    expect(logged).toHaveBeenCalledOnce();
  });

  it("KV を読めなくても読み込み済みのデータを使い、次は TTL 後に読みに行く", async () => {
    const { kv, cache, build, advance } = setup();
    await saveSnapshot(kv, snapshotAt("2026-11-04T00:00:00Z"));
    const first = await cache.get(kv, build);
    const get = vi.spyOn(kv, "get").mockRejectedValue(new Error("KV GET failed: 503 Service Unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    advance(1000);
    expect(await cache.get(kv, build)).toBe(first);
    expect(await cache.get(kv, build)).toBe(first);
    expect(get).toHaveBeenCalledOnce();
    expect(build).not.toHaveBeenCalled();
  });

  it("読み込み済みのデータがなく KV も読めなければエラーにする", async () => {
    const { kv, cache, build } = setup();
    vi.spyOn(kv, "get").mockRejectedValue(new Error("KV GET failed: 503 Service Unavailable"));
    await expect(cache.get(kv, build)).rejects.toThrow("KV GET failed");
    expect(build).not.toHaveBeenCalled();
  });

  it("作成に失敗したら retryMs の間は作り直さずに同じエラーを返す", async () => {
    const { kv, cache, build, advance } = setup();
    build.mockRejectedValueOnce(new Error("ODPT FlightSchedule dump request failed: 503 Service Unavailable"));
    await expect(cache.get(kv, build)).rejects.toThrow("ODPT FlightSchedule dump request failed");
    advance(2999);
    await expect(cache.get(kv, build)).rejects.toThrow("ODPT FlightSchedule dump request failed");
    expect(build).toHaveBeenCalledOnce();

    advance(1);
    expect((await cache.get(kv, build)).generatedAt).toBe("2026-11-04T00:00:00.000Z");
    expect(build).toHaveBeenCalledTimes(2);
  });
});
