import { describe, expect, it } from "vitest";
import type { FlightPattern } from "../src/timetable/normalize.js";
import { parseNote } from "../src/timetable/note.js";
import { resolveOnDate } from "../src/timetable/resolve.js";

// 2026-11-04 は水曜
function pattern(overrides: Partial<FlightPattern> = {}): FlightPattern {
  const base: FlightPattern = {
    group: "JAL",
    origin: "HND",
    destination: "FUK",
    weekdays: [3],
    flightNumber: "JL305",
    codeshares: [],
    operatedBy: "JAL",
    dep: "08:00",
    arr: "10:00",
    aircraft: ["738"],
    validFrom: "2026-10-25",
    validTo: "2027-01-04",
    rules: [],
    unparsedNote: [],
    ...overrides,
  };
  if (base.note && overrides.rules === undefined) {
    const parsed = parseNote(base.note, { from: base.validFrom, to: base.validTo });
    base.rules = parsed.rules;
    base.unparsedNote = parsed.unparsed;
  }
  return base;
}

describe("resolveOnDate", () => {
  it("曜日と有効期間が合えば運航する", () => {
    expect(resolveOnDate(pattern(), "2026-11-04")).toMatchObject({ dep: "08:00", arr: "10:00", durationMin: 120 });
    expect(resolveOnDate(pattern(), "2026-11-05")).toBeNull();
    expect(resolveOnDate(pattern({ validTo: "2026-11-03" }), "2026-11-04")).toBeNull();
  });

  it("時刻変更を適用し、適用した備考を返す", () => {
    const flight = resolveOnDate(pattern({ note: "11/1-10・10分遅発(到着は同時刻)" }), "2026-11-04");
    expect(flight).toMatchObject({ dep: "08:10", arr: "10:00", durationMin: 110, appliedNotes: ["11/1-10・10分遅発(到着は同時刻)"] });
    expect(resolveOnDate(pattern({ note: "11/1-10・10分遅発(到着は同時刻)" }), "2026-11-11")).not.toHaveProperty("appliedNotes");
  });

  it("運休日は運航しない", () => {
    expect(resolveOnDate(pattern({ note: "11/4・運休" }), "2026-11-04")).toBeNull();
    expect(resolveOnDate(pattern({ note: "11/4・運休" }), "2026-11-11")).not.toBeNull();
  });

  it("「運航」の指定があれば、その日以外は運航しない", () => {
    expect(resolveOnDate(pattern({ note: "11/11・18・運航" }), "2026-11-04")).toBeNull();
    expect(resolveOnDate(pattern({ note: "11/11・18・運航" }), "2026-11-11")).not.toBeNull();
  });

  it("運航会社・機材の変更を反映する", () => {
    const flight = resolveOnDate(pattern({ note: "11/1-10・JTA運航;FDA機材及び乗員にて運航" }), "2026-11-04");
    // 区間の順に適用するので、後に書かれた FDA が残る
    expect(flight?.operatedBy).toBe("FDA");
    expect(resolveOnDate(pattern({ note: "11/4・JAL・767J運航" }), "2026-11-04")?.aircraft).toEqual(["767"]);
  });

  it("コードシェア便名は国内航空会社のものだけを出す", () => {
    const flight = resolveOnDate(
      pattern({ group: "ANA", flightNumber: "7G041", codeshares: ["NH3841", "LH4920"], operatedBy: "SFJ" }),
      "2026-11-04",
    );
    expect(flight).toMatchObject({ airline: "ANA", flightNumber: "7G041", codeshares: ["NH3841"], operatedBy: "SFJ" });
  });

  it("解釈できない備考があれば原文を付ける", () => {
    const flight = resolveOnDate(pattern({ note: "機材変更の可能性あり" }), "2026-11-04");
    expect(flight?.note).toBe("機材変更の可能性あり");
  });
});
