import { z } from "zod";
import { AIRLINE_GROUPS } from "../timetable/carriers.js";
import { WEEKDAY_NAMES } from "../timetable/time.js";

const airline = z.enum(AIRLINE_GROUPS);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");
const weekday = z.enum(WEEKDAY_NAMES);
const dateRange = z.object({ from: date, to: date });

// ---- 入力 ----

const airportQuery = z
  .string()
  .trim()
  .min(1)
  .describe(
    "Airport: IATA code (HND), city code (TYO, OSA, SPK), or Japanese/English name (羽田, 札幌, 新千歳, Kansai). Cities expand to all their airports.",
  );
const dateInput = date.optional().describe("Date in JST (YYYY-MM-DD). Defaults to today in JST.");
const airlineInput = airline
  .optional()
  .describe(
    "Limit to one airline group. JAL includes JTA/RAC and partner-operated JAL flights; ANA includes codeshare flights operated by AIRDO, Solaseed Air, StarFlyer, IBEX and ORC.",
  );

export const searchAirportsInput = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Code, city or name to search (e.g. 札幌, 羽田, OKA, Kobe). Omit to list every airport JAL/ANA serve."),
});

export const listRoutesInput = z.object({
  from: airportQuery.optional(),
  to: airportQuery.optional(),
  airline: airlineInput,
  date: dateInput,
});

export const getRouteTimetableInput = z.object({
  from: airportQuery,
  to: airportQuery,
  date: dateInput,
  airline: airlineInput,
  departAfter: time.optional().describe("Only flights departing at or after this time (HH:MM, JST)."),
  departBefore: time.optional().describe("Only flights departing at or before this time (HH:MM, JST)."),
  arriveBefore: time.optional().describe("Only flights arriving at or before this time (HH:MM, JST)."),
});

export const getFlightInput = z.object({
  flightNumber: z
    .string()
    .trim()
    .min(3)
    .describe("Flight number with airline prefix, e.g. JL501, NH12, HD81, 7G41, or a codeshare number such as NH4781."),
  date: dateInput,
});

export const getDataInfoInput = z.object({});

// ---- 出力 ----

const legend = {
  airports: z.record(z.string(), z.string()).describe("Airport code to name for every code in this response."),
  carriers: z.record(z.string(), z.string()).describe("Carrier code to name for every operatedBy in this response."),
};

const warnings = z
  .array(z.string())
  .optional()
  .describe("Data caveats, e.g. the date is outside an airline's data range.");

const flight = z.object({
  airline: airline.describe("Airline group whose timetable lists this flight."),
  flightNumber: z.string().describe("Flight number of the operating carrier."),
  codeshares: z.array(z.string()).optional().describe("Domestic codeshare flight numbers."),
  operatedBy: z.string().describe("Operating carrier code (see carriers)."),
  from: z.string(),
  to: z.string(),
  dep: time.describe("Scheduled departure (JST), with date-specific changes applied."),
  arr: time.describe("Scheduled arrival (JST), with date-specific changes applied."),
  durationMin: z.number().int(),
  aircraft: z.array(z.string()).optional().describe("IATA aircraft type codes; several means any of them may be used."),
  appliedNotes: z.array(z.string()).optional().describe("Remarks applied for this date (retiming, operator change, etc.)."),
  note: z.string().optional().describe("Original remark, shown only when part of it could not be interpreted."),
});

export const searchAirportsOutput = z.object({
  cityGroup: z
    .object({ code: z.string().optional(), name: z.string(), airports: z.array(z.string()) })
    .optional()
    .describe("Set when the query named a city with several airports."),
  airports: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      nameEn: z.string(),
      airlines: z.array(airline).describe("Airline groups serving this airport. Empty means no JAL/ANA service."),
      destinations: z.number().int().describe("Number of airports reachable nonstop."),
    }),
  ),
});

export const listRoutesOutput = z.object({
  date,
  weekday,
  routes: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      totalFlights: z.number().int(),
      airlines: z.array(
        z.object({ airline, flights: z.number().int(), first: time, last: time }).describe("first/last are departure times."),
      ),
      durationMin: z.object({ min: z.number().int(), max: z.number().int() }),
    }),
  ),
  airports: legend.airports,
  warnings,
});

export const getRouteTimetableOutput = z.object({
  date,
  weekday,
  from: z.array(z.string()),
  to: z.array(z.string()),
  flights: z.array(flight),
  ...legend,
  warnings,
});

export const getFlightOutput = z.object({
  date,
  weekday,
  flights: z.array(flight).describe("Operations on the requested date (empty if it does not fly that day)."),
  periods: z
    .array(
      z.object({
        airline,
        flightNumber: z.string(),
        from: z.string(),
        to: z.string(),
        operatedBy: z.string(),
        validFrom: date,
        validTo: date,
        weekdays: z.array(weekday),
        dep: time,
        arr: time,
        aircraft: z.array(z.string()).optional(),
        note: z.string().optional().describe("Original remark with date-specific exceptions (Japanese)."),
      }),
    )
    .describe("Base schedule periods from the requested date onward, before remarks are applied."),
  ...legend,
  warnings,
});

export const getDataInfoOutput = z.object({
  source: z.string(),
  license: z.string(),
  licenseUrl: z.string(),
  generatedAt: z.string().describe("When this server last fetched the data from ODPT."),
  airlines: z.array(
    z.object({
      airline,
      dataAsOf: z.string().nullable().describe("Last update time reported by the data provider."),
      coverage: dateRange.nullable().describe("Date range the timetable covers."),
      routes: z.number().int(),
    }),
  ),
  notes: z.array(z.string()),
});

export type SearchAirportsInput = z.infer<typeof searchAirportsInput>;
export type ListRoutesInput = z.infer<typeof listRoutesInput>;
export type GetRouteTimetableInput = z.infer<typeof getRouteTimetableInput>;
export type GetFlightInput = z.infer<typeof getFlightInput>;
export type SearchAirportsOutput = z.infer<typeof searchAirportsOutput>;
export type ListRoutesOutput = z.infer<typeof listRoutesOutput>;
export type GetRouteTimetableOutput = z.infer<typeof getRouteTimetableOutput>;
export type GetFlightOutput = z.infer<typeof getFlightOutput>;
export type GetDataInfoOutput = z.infer<typeof getDataInfoOutput>;
