import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import type { TimetableDataset } from "../timetable/dataset.js";
import { todayInJst } from "../timetable/time.js";
import {
  getDataInfoInput,
  getDataInfoOutput,
  getFlightInput,
  getFlightOutput,
  getRouteTimetableInput,
  getRouteTimetableOutput,
  listRoutesInput,
  listRoutesOutput,
  searchAirportsInput,
  searchAirportsOutput,
} from "./schemas.js";
import { type ToolContext, getDataInfo, getFlight, getRouteTimetable, listRoutes, searchAirports } from "./tools.js";

const INSTRUCTIONS = `Japanese domestic flight timetables of the JAL and ANA groups, from ODPT open data.
- Airports can be given as IATA codes, city codes (TYO/OSA/SPK) or names (羽田, 札幌). Use search_airports when unsure.
- Times are scheduled JST. When a date is given, date-specific exceptions are already applied.
- Each airline's data covers a limited date range; read "warnings" and use get_data_info when results look empty.
- Fares, seat availability and real-time status are not available.`;

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export interface CreateMcpServerOptions {
  now?: () => Date;
}

export function createMcpServer(
  getDataset: () => Promise<TimetableDataset>,
  { now = () => new Date() }: CreateMcpServerOptions = {},
): McpServer {
  const server = new McpServer(
    { name: "jdf-mcp", version: "0.1.0" },
    // 既定の Ajv は実行時にコードを生成するため、Workers では使えない
    { instructions: INSTRUCTIONS, jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  );
  const context = async (): Promise<ToolContext> => ({ dataset: await getDataset(), today: todayInJst(now()) });

  server.registerTool(
    "search_airports",
    {
      title: "Search airports",
      description:
        "Find Japanese domestic airports by IATA code, city or name in Japanese or English (e.g. 札幌, 羽田, OKA, Kobe), with the airline groups (JAL/ANA) serving each. City names such as 東京, 大阪, 札幌 and 名古屋 return all their airports. Omit query to list every airport JAL/ANA serve.",
      inputSchema: searchAirportsInput,
      outputSchema: searchAirportsOutput,
      annotations: readOnly,
    },
    async (input) => toResult(searchAirports(await context(), input)),
  );

  server.registerTool(
    "list_routes",
    {
      title: "List routes",
      description:
        "List nonstop domestic routes from and/or to an airport on a date, with flights per airline group, first and last departure times, and flight duration range. Use it to see where you can fly from an airport or to compare JAL and ANA on a route. At least one of from/to is required.",
      inputSchema: listRoutesInput,
      outputSchema: listRoutesOutput,
      annotations: readOnly,
    },
    async (input) => toResult(listRoutes(await context(), input)),
  );

  server.registerTool(
    "get_route_timetable",
    {
      title: "Get route timetable",
      description:
        "Get every JAL/ANA nonstop flight between two airports on a date, with departure and arrival times (JST), duration, aircraft and operating carrier. Date-specific exceptions (retiming, suspension, operation by another carrier) are already applied. Cities expand to all their airports (e.g. 東京 = HND + NRT).",
      inputSchema: getRouteTimetableInput,
      outputSchema: getRouteTimetableOutput,
      annotations: readOnly,
    },
    async (input) => toResult(getRouteTimetable(await context(), input)),
  );

  server.registerTool(
    "get_flight",
    {
      title: "Get flight",
      description:
        "Look up a domestic flight by number (e.g. JL501, NH12, HD81, or a codeshare number such as NH4781). Returns its operation on the date (times with exceptions applied) and its schedule periods from that date onward (weekdays, validity, base times, remarks).",
      inputSchema: getFlightInput,
      outputSchema: getFlightOutput,
      annotations: readOnly,
    },
    async (input) => toResult(getFlight(await context(), input)),
  );

  server.registerTool(
    "get_data_info",
    {
      title: "Get data info",
      description:
        "Show the data source, license, last update and the date range covered for each airline group. Check this when results are empty or a date may be outside the data.",
      inputSchema: getDataInfoInput,
      outputSchema: getDataInfoOutput,
      annotations: readOnly,
    },
    async () => toResult(getDataInfo(await context())),
  );

  return server;
}

function toResult(structuredContent: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent };
}
