import {
  type ReportRegisterListBody,
  reportRegisterListSchema,
  type SalesReportBody,
  type SalesReportQuery,
  salesReportSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";

type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

function refusalOf(response: Response): Exclude<CloudReadOutcome<never>, { kind: "ok" }> {
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  return { kind: "failed" };
}

async function read<T>(path: string, schema: Schema<T>): Promise<CloudReadOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusalOf(response);
  }
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

export function fetchSalesReport(
  query: SalesReportQuery,
): Promise<CloudReadOutcome<SalesReportBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "register_id"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/sales-by-day";
  return read(search ? `${path}?${search}` : path, salesReportSchema);
}

export function fetchReportRegisters(): Promise<CloudReadOutcome<ReportRegisterListBody>> {
  return read("/api/reports/registers", reportRegisterListSchema);
}
