import { type AirlineGroup, isDomesticFlightNumber } from "./carriers.js";
import { type NoteRule, matchesDateSpec } from "./note.js";
import type { FlightPattern } from "./normalize.js";
import { addMinutes, durationMinutes, weekdayOf } from "./time.js";

/** 特定の日に実際に飛ぶ 1 便 */
export interface FlightInstance {
  airline: AirlineGroup;
  flightNumber: string;
  /** 国内航空会社のコードシェア便名 */
  codeshares?: string[];
  operatedBy: string;
  from: string;
  to: string;
  dep: string;
  arr: string;
  durationMin: number;
  aircraft?: string[];
  /** その日に適用した備考 (時刻変更・運航会社変更など) */
  appliedNotes?: string[];
  /** 備考の一部を解釈できなかった場合のみ、原文を付ける */
  note?: string;
}

/** 曜日・有効期間・備考の例外を突き合わせ、その日に運航しなければ null */
export function resolveOnDate(pattern: FlightPattern, date: string): FlightInstance | null {
  if (!pattern.weekdays.includes(weekdayOf(date)) || date < pattern.validFrom || date > pattern.validTo) return null;

  const applies = (rule: NoteRule) => rule.dates === undefined || matchesDateSpec(rule.dates, date);
  const operateOnly = pattern.rules.filter((r) => r.action.type === "operateOnly");
  if (operateOnly.length > 0 && !operateOnly.some(applies)) return null;
  const applicable = pattern.rules.filter(applies);
  if (applicable.some((r) => r.action.type === "suspend")) return null;

  let { dep, arr, operatedBy, aircraft } = pattern;
  for (const { action } of applicable) {
    switch (action.type) {
      case "shift":
        dep = addMinutes(dep, action.depMinutes);
        arr = addMinutes(arr, action.arrMinutes);
        break;
      case "operatedBy":
        operatedBy = action.airline;
        break;
      case "aircraft":
        aircraft = [action.aircraft];
        break;
    }
  }

  const codeshares = pattern.codeshares.filter(isDomesticFlightNumber);
  const appliedNotes = [...new Set(applicable.map((r) => r.source))];
  return {
    airline: pattern.group,
    flightNumber: pattern.flightNumber,
    ...(codeshares.length > 0 && { codeshares }),
    operatedBy,
    from: pattern.origin,
    to: pattern.destination,
    dep,
    arr,
    durationMin: durationMinutes(dep, arr),
    ...(aircraft.length > 0 && { aircraft }),
    ...(appliedNotes.length > 0 && { appliedNotes }),
    ...(pattern.unparsedNote.length > 0 && pattern.note !== undefined && { note: pattern.note }),
  };
}
