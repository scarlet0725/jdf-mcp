import { rawFlightSchedule } from "../odpt/schema.js";
import { AIRLINE_GROUPS, type AirlineGroup } from "./carriers.js";
import { isDomesticAirport } from "./airports.js";
import { type DateRange, type NoteRule, parseNote } from "./note.js";

/** ODPT の 1 便 × 1 有効期間。曜日違いで内容が同じものは 1 つにまとめる。日付ごとの例外 (JAL の備考) は rules に持つ */
export interface FlightPattern {
  group: AirlineGroup;
  origin: string;
  destination: string;
  /** 0 = 日曜 */
  weekdays: number[];
  /** 運航会社の便名 (odpt:flightNumber の先頭) */
  flightNumber: string;
  /** 先頭以外の便名。外国社のコードシェア便名も含む */
  codeshares: string[];
  operatedBy: string;
  dep: string;
  arr: string;
  /** ANA は "32P/32F" のように候補が複数並ぶことがある */
  aircraft: string[];
  validFrom: string;
  validTo: string;
  note?: string;
  rules: NoteRule[];
  /** 備考のうち解釈できなかった区間 */
  unparsedNote: string[];
}

export interface SourceInfo {
  /** レコードの dc:date の最新値 */
  dataAsOf: string | null;
  /** 国内線の有効期間の最小〜最大 */
  coverage: DateRange | null;
  records: number;
}

export interface NormalizedTimetable {
  patterns: FlightPattern[];
  sources: Record<AirlineGroup, SourceInfo>;
  /** 国内空港一覧に無いため除外した空港 (国際線の空港、または一覧の更新漏れ) */
  excludedAirports: string[];
}

const CALENDAR_WEEKDAYS: Readonly<Record<string, number>> = {
  "odpt.Calendar:Sunday": 0,
  "odpt.Calendar:Monday": 1,
  "odpt.Calendar:Tuesday": 2,
  "odpt.Calendar:Wednesday": 3,
  "odpt.Calendar:Thursday": 4,
  "odpt.Calendar:Friday": 5,
  "odpt.Calendar:Saturday": 6,
};

const stripPrefix = (id: string) => id.slice(id.indexOf(":") + 1);

/**
 * ODPT のダンプ (odpt:FlightSchedule の配列) を国内線の運航パターンにする。
 * ダンプ全体を一度に検証すると複製でメモリを倍使うため、レコードごとに検証する。
 */
export function normalizeFlightSchedules(records: readonly unknown[]): NormalizedTimetable {
  const patterns = new Map<string, FlightPattern>();
  const excludedAirports = new Set<string>();
  const sources = Object.fromEntries(
    AIRLINE_GROUPS.map((g) => [g, { dataAsOf: null, coverage: null, records: 0 }]),
  ) as Record<AirlineGroup, SourceInfo>;

  for (const [index, input] of records.entries()) {
    const parsed = rawFlightSchedule.safeParse(input);
    if (!parsed.success) throw new Error(`Invalid odpt:FlightSchedule record at index ${index}: ${parsed.error.message}`);
    const record = parsed.data;

    const group = stripPrefix(record["odpt:operator"]);
    if (!isAirlineGroup(group)) continue;
    const source = sources[group];
    source.records++;
    if (source.dataAsOf === null || record["dc:date"] > source.dataAsOf) source.dataAsOf = record["dc:date"];

    const weekday = CALENDAR_WEEKDAYS[record["odpt:calendar"]];
    if (weekday === undefined) throw new Error(`Unsupported calendar: ${record["odpt:calendar"]} (${record["owl:sameAs"]})`);

    const origin = stripPrefix(record["odpt:originAirport"]);
    const destination = stripPrefix(record["odpt:destinationAirport"]);
    if (!isDomesticAirport(origin) || !isDomesticAirport(destination)) {
      for (const code of [origin, destination]) if (!isDomesticAirport(code)) excludedAirports.add(code);
      continue;
    }

    for (const obj of record["odpt:flightScheduleObject"]) {
      const [flightNumber, ...codeshares] = obj["odpt:flightNumber"];
      const validFrom = obj["odpt:isValidFrom"].slice(0, 10);
      const validTo = obj["odpt:isValidTo"].slice(0, 10);
      const note = obj["odpt:note"]?.ja;
      const operatedBy = stripPrefix(obj["odpt:airline"]);
      const dep = obj["odpt:originTime"];
      const arr = obj["odpt:destinationTime"];
      const aircraft = obj["odpt:aircraftType"]?.split("/") ?? [];

      const key = JSON.stringify([group, origin, destination, flightNumber, codeshares, operatedBy, dep, arr, aircraft, validFrom, validTo, note]);
      const existing = patterns.get(key);
      if (existing) {
        if (!existing.weekdays.includes(weekday)) existing.weekdays.push(weekday);
        continue;
      }

      const parsedNote = note ? parseNote(note, { from: validFrom, to: validTo }) : { rules: [], unparsed: [] };
      patterns.set(key, {
        group,
        origin,
        destination,
        weekdays: [weekday],
        flightNumber: flightNumber!,
        codeshares,
        operatedBy,
        dep,
        arr,
        aircraft,
        validFrom,
        validTo,
        ...(note && { note }),
        rules: parsedNote.rules,
        unparsedNote: parsedNote.unparsed,
      });
      source.coverage = {
        from: source.coverage && source.coverage.from < validFrom ? source.coverage.from : validFrom,
        to: source.coverage && source.coverage.to > validTo ? source.coverage.to : validTo,
      };
    }
  }

  const merged = [...patterns.values()];
  for (const p of merged) p.weekdays.sort((a, b) => a - b);
  return { patterns: merged, sources, excludedAirports: [...excludedAirports].sort() };
}

function isAirlineGroup(s: string): s is AirlineGroup {
  return (AIRLINE_GROUPS as readonly string[]).includes(s);
}
