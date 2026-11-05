import { TimetableDataset } from "./timetable/dataset.js";
import { SNAPSHOT_FORMAT_VERSION, type TimetableSnapshot, parseSnapshot } from "./timetable/snapshot.js";

/** Workers KV のうち使う部分。KVNamespace をそのまま渡せる */
export interface TimetableKv {
  get(key: string, options: { type: "text"; cacheTtl?: number }): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

/** 形式を変えたらキーも変わるので、古い形式のデータを読むことはない */
export const TIMETABLE_KV_KEY = `timetable/v${SNAPSHOT_FORMAT_VERSION}`;

const DEFAULT_TTL_MS = 5 * 60_000;
const DEFAULT_RETRY_MS = 60_000;
// 「キーが無い」結果もこの秒数キャッシュされるため、初回作成直後に他の拠点で作り直しが続かないよう短めにする
const KV_CACHE_TTL_SECONDS = 60;

export async function saveSnapshot(kv: TimetableKv, snapshot: TimetableSnapshot): Promise<void> {
  await kv.put(TIMETABLE_KV_KEY, JSON.stringify(snapshot));
}

export interface TimetableCacheOptions {
  /** KV を見に行く間隔 */
  ttlMs?: number;
  /** 作成に失敗したあと、作り直さずに同じエラーを返す時間 */
  retryMs?: number;
  now?: () => number;
}

/**
 * KV のスナップショットを isolate 内にキャッシュする。
 * ttlMs ごとに KV を読み、内容が変わっていたときだけパースし直す。
 * KV が空 (初回デプロイ直後・形式変更直後) なら build で作って保存する。
 *
 * 障害時は手元のデータで応答を続ける。KV を読めなければ読み込み済みのデータを使い、
 * 保存に失敗しても作ったデータは使う。作成に失敗したら retryMs の間は ODPT を取りに行かない。
 */
export class TimetableCache {
  #cached: { text: string; dataset: TimetableDataset; checkedAt: number } | undefined;
  #pending: Promise<TimetableDataset> | undefined;
  #buildFailure: { error: unknown; at: number } | undefined;
  readonly #ttlMs: number;
  readonly #retryMs: number;
  readonly #now: () => number;

  constructor({ ttlMs = DEFAULT_TTL_MS, retryMs = DEFAULT_RETRY_MS, now = Date.now }: TimetableCacheOptions = {}) {
    this.#ttlMs = ttlMs;
    this.#retryMs = retryMs;
    this.#now = now;
  }

  get(kv: TimetableKv, build: () => Promise<TimetableSnapshot>): Promise<TimetableDataset> {
    if (this.#cached && this.#now() - this.#cached.checkedAt < this.#ttlMs) return Promise.resolve(this.#cached.dataset);
    // 同じ isolate に同時に来たリクエストで何度も読み込まないようにする
    this.#pending ??= this.#load(kv, build).finally(() => {
      this.#pending = undefined;
    });
    return this.#pending;
  }

  async #load(kv: TimetableKv, build: () => Promise<TimetableSnapshot>): Promise<TimetableDataset> {
    const cached = this.#cached;
    let text: string | null;
    try {
      text = await kv.get(TIMETABLE_KV_KEY, { type: "text", cacheTtl: KV_CACHE_TTL_SECONDS });
    } catch (error) {
      if (!cached) throw error;
      console.error("Failed to read the timetable from KV; using the loaded one.", error);
      // 次に KV を読むのは TTL 後にする
      cached.checkedAt = this.#now();
      return cached.dataset;
    }
    if (text === null) {
      if (cached) return cached.dataset;
      return this.#build(kv, build);
    }
    if (cached?.text === text) {
      cached.checkedAt = this.#now();
      return cached.dataset;
    }
    return this.#store(text, new TimetableDataset(parseSnapshot(text)));
  }

  async #build(kv: TimetableKv, build: () => Promise<TimetableSnapshot>): Promise<TimetableDataset> {
    const failure = this.#buildFailure;
    if (failure && this.#now() - failure.at < this.#retryMs) throw failure.error;

    let snapshot: TimetableSnapshot;
    try {
      snapshot = await build();
    } catch (error) {
      this.#buildFailure = { error, at: this.#now() };
      throw error;
    }
    this.#buildFailure = undefined;

    const text = JSON.stringify(snapshot);
    try {
      await kv.put(TIMETABLE_KV_KEY, text);
    } catch (error) {
      // 他の isolate も同時に作って書き込むと 429 になる。作ったデータはそのまま使い、保存は Cron に任せる
      console.error("Failed to save the timetable to KV.", error);
    }
    return this.#store(text, new TimetableDataset(snapshot));
  }

  #store(text: string, dataset: TimetableDataset): TimetableDataset {
    this.#cached = { text, dataset, checkedAt: this.#now() };
    return dataset;
  }
}
