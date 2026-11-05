import { describe, expect, it } from "vitest";
import { AirportResolutionError, resolveAirports } from "../src/timetable/airports.js";
import { flightNumberKey } from "../src/timetable/carriers.js";

describe("resolveAirports", () => {
  it.each([
    ["HND", ["HND"]],
    ["hnd", ["HND"]],
    ["羽田", ["HND"]],
    ["羽田空港", ["HND"]],
    ["新千歳", ["CTS"]],
    ["千歳", ["CTS"]],
    ["Haneda", ["HND"]],
    ["Kansai", ["KIX"]],
    ["那覇", ["OKA"]],
    ["沖縄", ["OKA"]],
    ["東京", ["HND", "NRT"]],
    ["TYO", ["HND", "NRT"]],
    ["大阪", ["ITM", "KIX"]],
    ["Sapporo", ["CTS", "OKD"]],
    ["名古屋", ["NGO", "NKM"]],
  ])("%s → %j", (query, codes) => {
    expect(resolveAirports(query)).toEqual(codes);
  });

  it("候補が絞れなければ候補付きでエラーにする", () => {
    expect(() => resolveAirports("大")).toThrow(AirportResolutionError);
    expect(() => resolveAirports("大")).toThrow(/ITM \(大阪\(伊丹\)\)/);
  });

  it("見つからなければエラーにする", () => {
    expect(() => resolveAirports("XYZ")).toThrow(/Unknown airport/);
  });
});

describe("flightNumberKey", () => {
  it.each([
    ["JL501", "JL501"],
    ["jl 501", "JL501"],
    ["JAL501", "JL501"],
    ["ANA12", "NH12"],
    ["HD081", "HD81"],
    ["HD81", "HD81"],
    ["7G041", "7G41"],
    ["6J-125", "6J125"],
  ])("%s → %s", (input, key) => {
    expect(flightNumberKey(input)).toBe(key);
  });

  it("便名として読めなければ undefined", () => {
    expect(flightNumberKey("501")).toBeUndefined();
    expect(flightNumberKey("羽田")).toBeUndefined();
  });
});
