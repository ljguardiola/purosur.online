import {
  type Freight,
  type FreightBody,
  type FreightList,
  type freightListQuerySchema,
  freightListSchema,
  freightSchema,
  type LinkablePurchaseSummary,
  linkablePurchaseListSchema,
} from "@purosur/contracts";
import type { z } from "zod";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type FreightPeriod = z.output<typeof freightListQuerySchema>["period"];

export type FetchFreightsInput = { period: FreightPeriod; search: string };

export type FetchLinkablePurchasesInput = { period: FreightPeriod; freightId?: string };

export type FetchFreightsOutcome = CloudReadOutcome<FreightList>;

export type FetchLinkablePurchasesOutcome = CloudReadOutcome<LinkablePurchaseSummary[]>;

type RequestRefusal =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

type FreightRefusal =
  | { kind: "validation_failed"; field: string }
  | { kind: "purchase_not_found" }
  | { kind: "purchases_without_value" }
  | RequestRefusal;

export type RecordFreightOutcome = { kind: "ok"; freight: Freight } | FreightRefusal;

export type EditFreightOutcome =
  | { kind: "ok"; freight: Freight }
  | { kind: "not_found" }
  | FreightRefusal;

function refusal(response: Response): RequestRefusal {
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

async function readCode(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
  return body?.code;
}

export async function fetchFreights({
  period,
  search,
}: FetchFreightsInput): Promise<FetchFreightsOutcome> {
  const query = new URLSearchParams({ period: String(period) });
  if (search !== "") {
    query.set("search", search);
  }
  let response: Response;
  try {
    response = await fetch(`/api/freights?${query.toString()}`);
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = freightListSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

export async function fetchLinkablePurchases({
  period,
  freightId,
}: FetchLinkablePurchasesInput): Promise<FetchLinkablePurchasesOutcome> {
  const query = new URLSearchParams({ period: String(period) });
  if (freightId !== undefined) {
    query.set("freightId", freightId);
  }
  let response: Response;
  try {
    response = await fetch(`/api/freights/linkable-purchases?${query.toString()}`);
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = linkablePurchaseListSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

async function refusedFreight(response: Response): Promise<FreightRefusal | { kind: "not_found" }> {
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  const code = await readCode(response);
  if (response.status === 404 && code === "purchase_not_found") {
    return { kind: "purchase_not_found" };
  }
  if (response.status === 404 && code === "freight_not_found") {
    return { kind: "not_found" };
  }
  if (response.status === 409 && code === "purchases_without_value") {
    return { kind: "purchases_without_value" };
  }
  return refusal(response);
}

async function sendFreight(
  method: "POST" | "PUT",
  path: string,
  body: FreightBody,
): Promise<{ kind: "ok"; freight: Freight } | FreightRefusal | { kind: "not_found" }> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = freightSchema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? { kind: "ok", freight: parsed.data } : { kind: "failed" };
  }
  return refusedFreight(response);
}

export async function recordFreight(body: FreightBody): Promise<RecordFreightOutcome> {
  const outcome = await sendFreight("POST", "/api/freights", body);
  return outcome.kind === "not_found" ? { kind: "failed" } : outcome;
}

export function editFreight(id: string, body: FreightBody): Promise<EditFreightOutcome> {
  return sendFreight("PUT", `/api/freights/${id}`, body);
}
