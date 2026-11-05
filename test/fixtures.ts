import { readFileSync } from "node:fs";
import { join } from "node:path";

/** ODPT のダンプと同じ形の小さなデータ (odpt:FlightSchedule の配列) */
export function loadFixture(): unknown[] {
  return JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/flight-schedules.json"), "utf8")) as unknown[];
}

/** KVNamespace の get/put だけを Map で再現する */
export class FakeKv {
  readonly values = new Map<string, string>();
  reads = 0;

  async get(key: string, _options: { type: "text"; cacheTtl?: number }): Promise<string | null> {
    this.reads++;
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}
