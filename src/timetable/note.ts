import { isCarrierCode } from "./carriers.js";
import { daysBetween, toDateString, weekdayOf } from "./time.js";

// JAL のデータの odpt:note.ja には、日付ごとの例外が次のような書式で入っている。
//
//   10/1-24・5分遅発(到着は同時刻)
//   7/1-16・8/29-31・運休
//   9/1-17・28-10/3・運休;9/18-27・10/4-24・FDA機材及び乗員にて運航
//   10/26-11/30の月・火・水・木・土・25分遅発
//   12/25-1/3・10分遅発(到着は同時刻)・JAL・767J運航
//
// ";" 区切りの各区間が「日付指定 (省略可)」+「内容」で、日付は "・" で列挙され、月を省略した日は直前の月を引き継ぐ。
// 年は書かれていないため、その便の有効期間 (isValidFrom〜isValidTo) に最も近い年として解釈する。
//
// 時刻変更の解釈:
//   「N分遅発」             出発・到着とも N 分遅れる
//   「N分遅発(到着は同時刻)」 出発のみ N 分遅れる
//   「N分遅着」             到着のみ N 分遅れる
//   「N分遅発M分遅着」       出発 N 分・到着 M 分遅れる
// 「N分遅発N分遅着」(同じ分数) という表記はデータに現れず、単独の「N分遅発」がその意味で使われている。

export interface DateRange {
  from: string;
  to: string;
}

export interface DateSpec {
  ranges: DateRange[];
  /** 0 = 日曜。指定がなければ全曜日 */
  weekdays?: number[];
}

export type NoteAction =
  /** 指定日は運休 */
  | { type: "suspend" }
  /** 指定日のみ運航 */
  | { type: "operateOnly" }
  | { type: "shift"; depMinutes: number; arrMinutes: number }
  /** 「FDA機材及び乗員にて運航」「JTA運航」など */
  | { type: "operatedBy"; airline: string }
  | { type: "aircraft"; aircraft: string };

export interface NoteRule {
  /** 省略時は有効期間中ずっと適用 */
  dates?: DateSpec;
  action: NoteAction;
  /** 元になった備考の区間 */
  source: string;
}

export interface ParsedNote {
  rules: NoteRule[];
  /** 解釈できなかった区間 */
  unparsed: string[];
}

export interface ValidityWindow {
  from: string;
  to: string;
}

const WEEKDAY_CHARS: Readonly<Record<string, number>> = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };
const DATE_TOKEN = /^(?:(\d{1,2})\/)?(\d{1,2})(?:-(?:(\d{1,2})\/)?(\d{1,2}))?(?:の([月火水木金土日]))?$/;
const WEEKDAY_TOKEN = /^[月火水木金土日]$/;

const DURATION = String.raw`(?:\d+時間)?\d+分|\d+時間`;
const SHIFT = new RegExp(String.raw`^((?:(?:${DURATION})[遅早][発着])+)(\(到着は同時刻\))?$`);
const SHIFT_PART = /(?:(\d+)時間)?(?:(\d+)分)?([遅早])([発着])/g;
const WET_LEASE = /^([A-Z]{2,3})機材及び乗員にて運航$/;
// 「738J運航」「JTA運航」「JAL・767J運航」「5分遅発・788FJ運航」
const EQUIPMENT = /^(?:(.*?)・)??(?:([A-Z]{2,3})・)?([0-9A-Z]{2,5})運航$/;

export function parseNote(text: string, window: ValidityWindow): ParsedNote {
  const rules: NoteRule[] = [];
  const unparsed: string[] = [];
  for (const segment of text.split(";").map((s) => s.trim())) {
    if (segment === "") continue;
    const parsed = parseSegment(segment, window);
    if (parsed) rules.push(...parsed);
    else unparsed.push(segment);
  }
  return { rules, unparsed };
}

export function matchesDateSpec(spec: DateSpec, date: string): boolean {
  return (
    spec.ranges.some((r) => r.from <= date && date <= r.to) &&
    (spec.weekdays === undefined || spec.weekdays.includes(weekdayOf(date)))
  );
}

function parseSegment(segment: string, window: ValidityWindow): NoteRule[] | null {
  const tokens = segment.split("・");
  const ranges: DateRange[] = [];
  let weekdays: number[] | undefined;
  let month = Number(window.from.slice(5, 7));

  let i = 0;
  while (i < tokens.length) {
    const m = DATE_TOKEN.exec(tokens[i]!);
    if (!m) break;
    i++;
    const [, m1, d1, m2, d2, weekday] = m;
    const startMonth = m1 ? Number(m1) : month;
    const endMonth = m2 ? Number(m2) : startMonth;
    month = endMonth;
    ranges.push(toRange(startMonth, Number(d1), endMonth, Number(d2 ?? d1), window));
    if (weekday) {
      weekdays = [WEEKDAY_CHARS[weekday]!];
      while (i < tokens.length && WEEKDAY_TOKEN.test(tokens[i]!)) weekdays.push(WEEKDAY_CHARS[tokens[i++]!]!);
      break;
    }
  }

  const actions = parseAction(tokens.slice(i).join("・"));
  if (!actions) return null;
  const dates: DateSpec | undefined = ranges.length > 0 ? { ranges, ...(weekdays && { weekdays }) } : undefined;
  return actions.map((action) => ({ ...(dates && { dates }), action, source: segment }));
}

function parseAction(text: string): NoteAction[] | null {
  if (text === "運休") return [{ type: "suspend" }];
  if (text === "運航") return [{ type: "operateOnly" }];

  const wetLease = WET_LEASE.exec(text);
  if (wetLease) return [{ type: "operatedBy", airline: wetLease[1]! }];

  const shift = parseShift(text);
  if (shift) return [shift];

  const equipment = EQUIPMENT.exec(text);
  if (equipment) {
    const [, rest, operator, token] = equipment;
    const actions: NoteAction[] = [];
    if (rest !== undefined) {
      const restActions = parseAction(rest);
      if (!restActions) return null;
      actions.push(...restActions);
    }
    if (operator) actions.push({ type: "operatedBy", airline: operator });
    if (!operator && isCarrierCode(token!)) actions.push({ type: "operatedBy", airline: token! });
    else actions.push({ type: "aircraft", aircraft: normalizeAircraft(token!) });
    return actions;
  }

  return null;
}

function parseShift(text: string): NoteAction | null {
  const m = SHIFT.exec(text);
  if (!m) return null;
  let dep: number | undefined;
  let arr: number | undefined;
  for (const [, hours, minutes, direction, kind] of m[1]!.matchAll(SHIFT_PART)) {
    const delta = (Number(hours ?? 0) * 60 + Number(minutes ?? 0)) * (direction === "遅" ? 1 : -1);
    if (kind === "発") dep = delta;
    else arr = delta;
  }
  const arrivalUnchanged = m[2] !== undefined;
  return { type: "shift", depMinutes: dep ?? 0, arrMinutes: arr ?? (arrivalUnchanged ? 0 : (dep ?? 0)) };
}

/** 「738J」「767FJ」のような座席仕様付きの機材表記を odpt:aircraftType と同じ形 ("738") に揃える */
function normalizeAircraft(token: string): string {
  const base = token.replace(/F?J$/, "");
  return base.length >= 3 ? base : token;
}

function toRange(startMonth: number, startDay: number, endMonth: number, endDay: number, window: ValidityWindow): DateRange {
  const from = resolveDate(startMonth, startDay, window);
  let to = resolveDate(endMonth, endDay, window);
  if (to < from) to = toDateString(Number(from.slice(0, 4)) + 1, endMonth, endDay);
  return { from, to };
}

function resolveDate(month: number, day: number, window: ValidityWindow): string {
  const baseYear = Number(window.from.slice(0, 4));
  let best = "";
  let bestDistance = Infinity;
  for (const year of [baseYear - 1, baseYear, baseYear + 1]) {
    const date = toDateString(year, month, day);
    const distance =
      date < window.from ? daysBetween(date, window.from) : date > window.to ? daysBetween(window.to, date) : 0;
    if (distance < bestDistance) {
      best = date;
      bestDistance = distance;
    }
  }
  return best;
}
