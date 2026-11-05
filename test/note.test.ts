import { describe, expect, it } from "vitest";
import { matchesDateSpec, parseNote } from "../src/timetable/note.js";

const winter = { from: "2026-10-25", to: "2027-01-04" };
const autumn = { from: "2026-09-01", to: "2026-10-24" };

const actions = (text: string, window = winter) => parseNote(text, window).rules.map((r) => r.action);

describe("parseNote: 時刻変更", () => {
  it.each([
    ["10/1-24・5分遅発", { depMinutes: 5, arrMinutes: 5 }],
    ["10/1-24・5分早発(到着は同時刻)", { depMinutes: -5, arrMinutes: 0 }],
    ["10/1-24・5分遅着", { depMinutes: 0, arrMinutes: 5 }],
    ["10/1-24・10分遅発5分早着", { depMinutes: 10, arrMinutes: -5 }],
    ["10/1-24・1時間25分早発", { depMinutes: -85, arrMinutes: -85 }],
    ["10/1-24・2時間遅発", { depMinutes: 120, arrMinutes: 120 }],
  ])("%s", (text, shift) => {
    expect(actions(text, autumn)).toEqual([{ type: "shift", ...shift }]);
  });
});

describe("parseNote: 日付", () => {
  it("月を省略した日は直前の月を引き継ぐ", () => {
    const { rules } = parseNote("9/1-17・28-10/3・運休", autumn);
    expect(rules[0]?.dates?.ranges).toEqual([
      { from: "2026-09-01", to: "2026-09-17" },
      { from: "2026-09-28", to: "2026-10-03" },
    ]);
  });

  it("有効期間に合わせて年をまたぐ", () => {
    const { rules } = parseNote("12/1-24・1/4・10分遅着;12/25-1/3・運休", winter);
    expect(rules.map((r) => r.dates?.ranges)).toEqual([
      [
        { from: "2026-12-01", to: "2026-12-24" },
        { from: "2027-01-04", to: "2027-01-04" },
      ],
      [{ from: "2026-12-25", to: "2027-01-03" }],
    ]);
  });

  it("曜日の指定を読む", () => {
    const { rules } = parseNote("10/26-11/30の月・火・水・木・土・25分遅発", winter);
    expect(rules[0]?.dates).toEqual({ ranges: [{ from: "2026-10-26", to: "2026-11-30" }], weekdays: [1, 2, 3, 4, 6] });
    expect(rules[0]?.action).toEqual({ type: "shift", depMinutes: 25, arrMinutes: 25 });
  });

  it("日付がなければ有効期間中ずっと適用する", () => {
    const { rules } = parseNote("FDA機材及び乗員にて運航", winter);
    expect(rules).toEqual([{ action: { type: "operatedBy", airline: "FDA" }, source: "FDA機材及び乗員にて運航" }]);
  });

  it("matchesDateSpec は範囲と曜日の両方を見る", () => {
    const spec = { ranges: [{ from: "2026-11-01", to: "2026-11-30" }], weekdays: [3] };
    expect(matchesDateSpec(spec, "2026-11-04")).toBe(true); // 水曜
    expect(matchesDateSpec(spec, "2026-11-05")).toBe(false); // 木曜
    expect(matchesDateSpec(spec, "2026-12-02")).toBe(false); // 範囲外
  });
});

describe("parseNote: 運航会社・機材", () => {
  it.each([
    ["12/25-1/3・JAL・767J運航", [{ type: "operatedBy", airline: "JAL" }, { type: "aircraft", aircraft: "767" }]],
    ["12/25-1/3・JTA運航", [{ type: "operatedBy", airline: "JTA" }]],
    ["11/16-23・ATR運航", [{ type: "aircraft", aircraft: "ATR" }]],
    ["9/7・JAR・E90J運航", [{ type: "operatedBy", airline: "JAR" }, { type: "aircraft", aircraft: "E90" }]],
    [
      "8/1-31・5分遅発・788FJ運航",
      [
        { type: "shift", depMinutes: 5, arrMinutes: 5 },
        { type: "aircraft", aircraft: "788" },
      ],
    ],
    ["10/25-29・運航", [{ type: "operateOnly" }]],
  ])("%s", (text, expected) => {
    expect(actions(text)).toEqual(expected);
  });

  it("複数区間を ; で分けて読む", () => {
    const { rules } = parseNote("10/25-29・12/4-8・運航;10/25-29・ORC機材及び乗員にて運航", winter);
    expect(rules.map((r) => [r.action.type, r.source])).toEqual([
      ["operateOnly", "10/25-29・12/4-8・運航"],
      ["operatedBy", "10/25-29・ORC機材及び乗員にて運航"],
    ]);
  });

  it("解釈できない区間は unparsed に残す", () => {
    const parsed = parseNote("10/25-29・運休;機材変更の可能性あり", winter);
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.unparsed).toEqual(["機材変更の可能性あり"]);
  });
});
