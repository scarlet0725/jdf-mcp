import { AIRLINE_GROUPS, type AirlineGroup, flightNumberKey } from "./carriers.js";
import type { FlightPattern, SourceInfo } from "./normalize.js";
import { type FlightInstance, resolveOnDate } from "./resolve.js";
import type { TimetableSnapshot } from "./snapshot.js";
import { WEEKDAY_NAMES, type WeekdayName } from "./time.js";

export interface FlightQuery {
  origins?: readonly string[];
  destinations?: readonly string[];
  airline?: AirlineGroup;
}

export interface RouteSummary {
  from: string;
  to: string;
  totalFlights: number;
  airlines: { airline: AirlineGroup; flights: number; first: string; last: string }[];
  durationMin: { min: number; max: number };
}

/** get_flight で返す運航パターン (曜日をまとめたもの) */
export interface FlightPeriod {
  airline: AirlineGroup;
  flightNumber: string;
  from: string;
  to: string;
  operatedBy: string;
  validFrom: string;
  validTo: string;
  weekdays: WeekdayName[];
  dep: string;
  arr: string;
  aircraft?: string[];
  note?: string;
}

export interface ServedAirport {
  code: string;
  airlines: AirlineGroup[];
  destinations: number;
}

// 月曜始まりで並べる
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const routeKey = (origin: string, destination: string) => `${origin}-${destination}`;

export class TimetableDataset {
  /** スナップショットを作った (ODPT から取得した) 日時 */
  readonly generatedAt: string;
  readonly sources: Readonly<Record<AirlineGroup, SourceInfo>>;
  readonly excludedAirports: readonly string[];
  readonly #byRoute = new Map<string, FlightPattern[]>();
  readonly #byFlightNumber = new Map<string, FlightPattern[]>();
  readonly #served = new Map<string, { airlines: Set<AirlineGroup>; destinations: Set<string> }>();

  constructor(snapshot: TimetableSnapshot) {
    this.generatedAt = snapshot.generatedAt;
    this.sources = snapshot.sources;
    this.excludedAirports = snapshot.excludedAirports;
    for (const p of snapshot.patterns) {
      pushTo(this.#byRoute, routeKey(p.origin, p.destination), p);
      // 外国社のコードシェア便名でも引けるように全便名を索引する
      for (const number of new Set([p.flightNumber, ...p.codeshares].map(flightNumberKey))) {
        if (number) pushTo(this.#byFlightNumber, number, p);
      }
      for (const [code, other] of [
        [p.origin, p.destination],
        [p.destination, p.origin],
      ] as const) {
        const served = this.#served.get(code) ?? { airlines: new Set(), destinations: new Set() };
        served.airlines.add(p.group);
        served.destinations.add(other);
        this.#served.set(code, served);
      }
    }
  }

  /** 指定日に運航する便を出発時刻順に返す */
  flightsOn(date: string, query: FlightQuery): FlightInstance[] {
    const flights: FlightInstance[] = [];
    for (const [key, patterns] of this.#byRoute) {
      if (!matchesRoute(key, query)) continue;
      for (const p of patterns) {
        if (query.airline && p.group !== query.airline) continue;
        const flight = resolveOnDate(p, date);
        if (flight) flights.push(flight);
      }
    }
    return flights.sort(
      (a, b) => a.dep.localeCompare(b.dep) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
    );
  }

  /** 指定日に 1 便以上ある路線を、出発空港ごとに便数の多い順で返す */
  routesOn(date: string, query: FlightQuery): RouteSummary[] {
    const byRoute = new Map<string, FlightInstance[]>();
    for (const f of this.flightsOn(date, query)) pushTo(byRoute, routeKey(f.from, f.to), f);

    return [...byRoute.values()]
      .map((flights) => {
        const airlines = AIRLINE_GROUPS.flatMap((airline) => {
          const own = flights.filter((f) => f.airline === airline);
          if (own.length === 0) return [];
          return [{ airline, flights: own.length, first: own[0]!.dep, last: own.at(-1)!.dep }];
        });
        const durations = flights.map((f) => f.durationMin);
        return {
          from: flights[0]!.from,
          to: flights[0]!.to,
          totalFlights: flights.length,
          airlines,
          durationMin: { min: Math.min(...durations), max: Math.max(...durations) },
        };
      })
      .sort((a, b) => a.from.localeCompare(b.from) || b.totalFlights - a.totalFlights || a.to.localeCompare(b.to));
  }

  /** 便名で探し、指定日の運航と、指定日以降の運航パターンを返す */
  findFlight(flightNumber: string, date: string): { flights: FlightInstance[]; periods: FlightPeriod[] } | undefined {
    const key = flightNumberKey(flightNumber);
    const patterns = key ? this.#byFlightNumber.get(key) : undefined;
    if (!patterns) return undefined;

    const flights = patterns
      .map((p) => resolveOnDate(p, date))
      .filter((f) => f !== null)
      .sort((a, b) => a.dep.localeCompare(b.dep));

    const periods = patterns
      .filter((p) => p.validTo >= date)
      .map((p) => ({
        airline: p.group,
        flightNumber: p.flightNumber,
        from: p.origin,
        to: p.destination,
        operatedBy: p.operatedBy,
        validFrom: p.validFrom,
        validTo: p.validTo,
        weekdays: WEEKDAY_ORDER.filter((w) => p.weekdays.includes(w)).map((w) => WEEKDAY_NAMES[w]!),
        dep: p.dep,
        arr: p.arr,
        ...(p.aircraft.length > 0 && { aircraft: p.aircraft }),
        ...(p.note !== undefined && { note: p.note }),
      }))
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom) || a.from.localeCompare(b.from) || a.dep.localeCompare(b.dep));

    return { flights, periods };
  }

  /** JAL・ANA が就航している空港 */
  servedAirports(): ServedAirport[] {
    return [...this.#served]
      .map(([code, s]) => ({
        code,
        airlines: AIRLINE_GROUPS.filter((g) => s.airlines.has(g)),
        destinations: s.destinations.size,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  servedAirport(code: string): ServedAirport | undefined {
    const s = this.#served.get(code);
    if (!s) return undefined;
    return { code, airlines: AIRLINE_GROUPS.filter((g) => s.airlines.has(g)), destinations: s.destinations.size };
  }

  routeCount(airline: AirlineGroup): number {
    let count = 0;
    for (const patterns of this.#byRoute.values()) if (patterns.some((p) => p.group === airline)) count++;
    return count;
  }

  /** 指定日がデータの提供期間外の航空会社について警告文を返す */
  coverageWarnings(date: string, airline?: AirlineGroup): string[] {
    return (airline ? [airline] : AIRLINE_GROUPS).flatMap((g) => {
      const coverage = this.sources[g].coverage;
      if (!coverage) return [`No ${g} timetable data is loaded; ${g} flights are unknown.`];
      if (date < coverage.from || date > coverage.to) {
        return [
          `${date} is outside the ${g} timetable data (${coverage.from} to ${coverage.to}). Missing ${g} flights mean "no data", not "no service".`,
        ];
      }
      return [];
    });
  }
}

function matchesRoute(key: string, { origins, destinations }: FlightQuery): boolean {
  const [origin, destination] = key.split("-");
  return (!origins || origins.includes(origin!)) && (!destinations || destinations.includes(destination!));
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
