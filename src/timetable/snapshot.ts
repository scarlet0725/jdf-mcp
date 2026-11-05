import { type NormalizedTimetable, normalizeFlightSchedules } from "./normalize.js";

/** 保存しておく正規化済みの時刻表。形を変えたら上げる (保存先のキーにも使う) */
export const SNAPSHOT_FORMAT_VERSION = 1;

export interface TimetableSnapshot extends NormalizedTimetable {
  formatVersion: typeof SNAPSHOT_FORMAT_VERSION;
  generatedAt: string;
}

export function createSnapshot(records: readonly unknown[], generatedAt: Date = new Date()): TimetableSnapshot {
  return {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    generatedAt: generatedAt.toISOString(),
    ...normalizeFlightSchedules(records),
  };
}

export function parseSnapshot(text: string): TimetableSnapshot {
  const snapshot = JSON.parse(text) as { formatVersion?: unknown };
  if (snapshot.formatVersion !== SNAPSHOT_FORMAT_VERSION) {
    throw new Error(`Unsupported timetable snapshot format: ${String(snapshot.formatVersion)}`);
  }
  return snapshot as TimetableSnapshot;
}
