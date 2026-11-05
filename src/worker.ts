import { createApp } from "./app.js";
import { TimetableCache, saveSnapshot } from "./kv.js";
import { fetchFlightScheduleDump } from "./odpt/client.js";
import { type TimetableSnapshot, createSnapshot } from "./timetable/snapshot.js";

export interface Env {
  /** 正規化済みの時刻表 (スナップショット) の置き場 */
  TIMETABLE: KVNamespace;
  /** ODPT のアクセストークン (wrangler secret) */
  ODPT_CONSUMER_KEY: string;
}

async function buildSnapshot(env: Env): Promise<TimetableSnapshot> {
  const records = await fetchFlightScheduleDump({
    consumerKey: env.ODPT_CONSUMER_KEY,
    signal: AbortSignal.timeout(60_000),
  });
  return createSnapshot(records);
}

// isolate が生きている間はパース済みの時刻表を使い回す
const cache = new TimetableCache();
const app = createApp<Env>((env) => cache.get(env.TIMETABLE, () => buildSnapshot(env)));

export default {
  fetch: app.fetch,

  // Cron Trigger で ODPT のダンプを取り直し、KV のスナップショットを更新する
  async scheduled(_controller, env) {
    const snapshot = await buildSnapshot(env);
    await saveSnapshot(env.TIMETABLE, snapshot);

    for (const [airline, s] of Object.entries(snapshot.sources)) {
      const coverage = s.coverage ? `${s.coverage.from}..${s.coverage.to}` : "none";
      console.log(`Refreshed ${airline}: ${s.records} records, coverage ${coverage}, data as of ${s.dataAsOf}`);
    }
    console.log(`Snapshot: ${snapshot.patterns.length} patterns, excluded airports: ${snapshot.excludedAirports.join(" ")}`);
  },
} satisfies ExportedHandler<Env>;
