import { z } from "zod";

// ODPT API 仕様 v4 の odpt:FlightSchedule。このサーバーで使う項目だけを検証する。

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const rawFlightScheduleObject = z.object({
  "odpt:airline": z.string(),
  "odpt:flightNumber": z.array(z.string()).min(1),
  "odpt:originTime": time,
  "odpt:destinationTime": time,
  "odpt:originDayDifference": z.number().int().optional(),
  "odpt:destinationDayDifference": z.number().int().optional(),
  "odpt:aircraftType": z.string().optional(),
  "odpt:isValidFrom": z.string(),
  "odpt:isValidTo": z.string(),
  "odpt:note": z.object({ ja: z.string().optional(), en: z.string().optional() }).optional(),
});

export const rawFlightSchedule = z.object({
  "dc:date": z.string(),
  "owl:sameAs": z.string(),
  "odpt:operator": z.string(),
  "odpt:calendar": z.string(),
  "odpt:originAirport": z.string(),
  "odpt:destinationAirport": z.string(),
  "odpt:flightScheduleObject": z.array(rawFlightScheduleObject),
});

export const rawFlightScheduleDump = z.array(rawFlightSchedule);

export type RawFlightScheduleObject = z.infer<typeof rawFlightScheduleObject>;
export type RawFlightSchedule = z.infer<typeof rawFlightSchedule>;
