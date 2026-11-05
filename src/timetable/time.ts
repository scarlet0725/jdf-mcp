// 日付は JST の "YYYY-MM-DD"、時刻は JST の "HH:MM" 文字列で扱う。
// 国内線のみを対象とするため、日跨ぎ・タイムゾーン差は考慮しない。

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type WeekdayName = (typeof WEEKDAY_NAMES)[number];

const MINUTES_PER_DAY = 24 * 60;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function todayInJst(now: Date = new Date()): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 0 = 日曜 */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function weekdayName(date: string): WeekdayName {
  return WEEKDAY_NAMES[weekdayOf(date)]!;
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

export function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

export function fromMinutes(minutes: number): string {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function addMinutes(time: string, delta: number): string {
  return fromMinutes(toMinutes(time) + delta);
}

export function durationMinutes(dep: string, arr: string): number {
  const d = toMinutes(arr) - toMinutes(dep);
  return d < 0 ? d + MINUTES_PER_DAY : d;
}
