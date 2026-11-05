import { DOMESTIC_AIRPORTS, airportName, matchAirports, resolveAirports } from "../timetable/airports.js";
import { AIRLINE_GROUPS, carrierName } from "../timetable/carriers.js";
import type { TimetableDataset } from "../timetable/dataset.js";
import type { FlightInstance } from "../timetable/resolve.js";
import { isValidDate, weekdayName } from "../timetable/time.js";
import type {
  GetDataInfoOutput,
  GetFlightInput,
  GetFlightOutput,
  GetRouteTimetableInput,
  GetRouteTimetableOutput,
  ListRoutesInput,
  ListRoutesOutput,
  SearchAirportsInput,
  SearchAirportsOutput,
} from "./schemas.js";

// MCP ツールの本体。入出力は schemas.ts の zod スキーマに対応する。
// ここで投げた Error のメッセージは、SDK が isError: true のツール結果としてクライアントに返す。

export interface ToolContext {
  dataset: TimetableDataset;
  /** JST の今日 (YYYY-MM-DD)。date 省略時に使う */
  today: string;
}

export function searchAirports({ dataset }: ToolContext, { query }: SearchAirportsInput): SearchAirportsOutput {
  const toOutput = (code: string) => {
    const airport = DOMESTIC_AIRPORTS.get(code)!;
    const served = dataset.servedAirport(code);
    return {
      code,
      name: airport.name,
      nameEn: airport.nameEn,
      airlines: served?.airlines ?? [],
      destinations: served?.destinations ?? 0,
    };
  };

  if (query === undefined) return { airports: dataset.servedAirports().map((s) => toOutput(s.code)) };

  const { airports, cityGroup } = matchAirports(query);
  return {
    ...(cityGroup && {
      cityGroup: { ...(cityGroup.code && { code: cityGroup.code }), name: cityGroup.name, airports: cityGroup.airports },
    }),
    airports: airports.map((a) => toOutput(a.code)),
  };
}

export function listRoutes({ dataset, today }: ToolContext, input: ListRoutesInput): ListRoutesOutput {
  if (input.from === undefined && input.to === undefined) {
    throw new Error("Specify at least one of from or to.");
  }
  const date = resolveDate(input.date, today);
  const origins = input.from === undefined ? undefined : resolveAirports(input.from);
  const destinations = input.to === undefined ? undefined : resolveAirports(input.to);

  const routes = dataset.routesOn(date, { origins, destinations, airline: input.airline });
  return {
    date,
    weekday: weekdayName(date),
    routes,
    airports: airportLegend([...(origins ?? []), ...(destinations ?? []), ...routes.flatMap((r) => [r.from, r.to])]),
    ...withWarnings(dataset.coverageWarnings(date, input.airline)),
  };
}

export function getRouteTimetable({ dataset, today }: ToolContext, input: GetRouteTimetableInput): GetRouteTimetableOutput {
  const date = resolveDate(input.date, today);
  const origins = resolveAirports(input.from);
  const destinations = resolveAirports(input.to);

  const flights = dataset
    .flightsOn(date, { origins, destinations, airline: input.airline })
    .filter(
      (f) =>
        (input.departAfter === undefined || f.dep >= input.departAfter) &&
        (input.departBefore === undefined || f.dep <= input.departBefore) &&
        (input.arriveBefore === undefined || f.arr <= input.arriveBefore),
    );

  return {
    date,
    weekday: weekdayName(date),
    from: origins,
    to: destinations,
    flights,
    airports: airportLegend([...origins, ...destinations]),
    carriers: carrierLegend(flights.map((f) => f.operatedBy)),
    ...withWarnings(dataset.coverageWarnings(date, input.airline)),
  };
}

export function getFlight({ dataset, today }: ToolContext, input: GetFlightInput): GetFlightOutput {
  const date = resolveDate(input.date, today);
  const found = dataset.findFlight(input.flightNumber, date);
  if (!found) {
    throw new Error(
      `Flight "${input.flightNumber}" was not found in the JAL/ANA domestic timetables. Use the airline prefix, e.g. JL501 or NH12.`,
    );
  }

  const { flights, periods } = found;
  const airlines = new Set([...flights, ...periods].map((f) => f.airline));
  const all: Pick<FlightInstance, "from" | "to" | "operatedBy">[] = [...flights, ...periods];
  return {
    date,
    weekday: weekdayName(date),
    flights,
    periods,
    airports: airportLegend(all.flatMap((f) => [f.from, f.to])),
    carriers: carrierLegend(all.map((f) => f.operatedBy)),
    ...withWarnings(AIRLINE_GROUPS.filter((g) => airlines.has(g)).flatMap((g) => dataset.coverageWarnings(date, g))),
  };
}

export function getDataInfo({ dataset }: ToolContext): GetDataInfoOutput {
  return {
    source: "公共交通オープンデータセンター (ODPT) odpt:FlightSchedule — 日本航空 / 全日空 フライト時刻表",
    license: "公共交通オープンデータ基本ライセンス (Public Transportation Open Data Basic License)",
    licenseUrl: "https://developer.odpt.org/terms",
    generatedAt: dataset.generatedAt,
    airlines: AIRLINE_GROUPS.map((airline) => ({
      airline,
      dataAsOf: dataset.sources[airline].dataAsOf,
      coverage: dataset.sources[airline].coverage,
      routes: dataset.routeCount(airline),
    })),
    notes: [
      "Domestic flights only. Times are scheduled local times (JST).",
      "Date-specific exceptions in JAL remarks (retiming, suspension, operator or aircraft changes) are applied when a date is given.",
      "The ANA timetable includes flights operated by partners (AIRDO, Solaseed Air, StarFlyer, IBEX, ORC) with NH codeshare numbers.",
      "Fares, seat availability and real-time flight status are not included.",
    ],
  };
}

function resolveDate(date: string | undefined, today: string): string {
  const resolved = date ?? today;
  if (!isValidDate(resolved)) throw new Error(`Invalid date "${resolved}". Use YYYY-MM-DD.`);
  return resolved;
}

function airportLegend(codes: Iterable<string>): Record<string, string> {
  return Object.fromEntries([...new Set(codes)].sort().map((code) => [code, airportName(code)]));
}

function carrierLegend(codes: Iterable<string>): Record<string, string> {
  return Object.fromEntries([...new Set(codes)].sort().map((code) => [code, carrierName(code)]));
}

function withWarnings(warnings: string[]): { warnings?: string[] } {
  return warnings.length > 0 ? { warnings } : {};
}
