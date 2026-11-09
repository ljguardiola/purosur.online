import {
  type PointTerminalAssignmentBody,
  pointTerminalAssignmentSchema,
  type QrPointOfSaleAssignmentBody,
  qrPointOfSaleAssignmentSchema,
} from "@purosur/contracts";
import { cloudFetch } from "../platform/cloud-fetch";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type AssignPointTerminalOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "point_terminal_taken" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type AssignQrPointOfSaleOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "qr_point_of_sale_taken" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export async function assignPointTerminal(
  registerId: string,
  body: PointTerminalAssignmentBody,
): Promise<AssignPointTerminalOutcome> {
  let response: Response;
  try {
    response = await cloudFetch(`/api/registers/${registerId}/point-terminal`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = pointTerminalAssignmentSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return parsed.success ? { kind: "ok" } : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = ((await response.json().catch(() => undefined)) as { code?: string } | undefined)
      ?.code;
    return code === "point_terminal_taken" || code === "stale_version"
      ? { kind: code }
      : { kind: "failed" };
  }
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

export async function assignQrPointOfSale(
  registerId: string,
  body: QrPointOfSaleAssignmentBody,
): Promise<AssignQrPointOfSaleOutcome> {
  let response: Response;
  try {
    response = await cloudFetch(`/api/registers/${registerId}/qr-point-of-sale`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = qrPointOfSaleAssignmentSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return parsed.success ? { kind: "ok" } : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = ((await response.json().catch(() => undefined)) as { code?: string } | undefined)
      ?.code;
    return code === "qr_point_of_sale_taken" || code === "stale_version"
      ? { kind: code }
      : { kind: "failed" };
  }
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
