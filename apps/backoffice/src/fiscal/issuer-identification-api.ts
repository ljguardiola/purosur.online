import {
  type IssuerIdentificationBody,
  type IssuerIdentificationEditBody,
  issuerIdentificationSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type IssuerIdentification = {
  legalName: string | null;
  grossIncomeRegistration: string | null;
  activityStartDate: string | null;
  /** Always the CUIT the business is authorized under at the tax authority; never editable. */
  authorizedCuit: string;
  /** Always "Responsable Monotributo" today; never editable. */
  taxStatus: string;
  version: number;
};

export type FetchIssuerIdentificationOutcome = CloudReadOutcome<IssuerIdentification>;

export type SaveIssuerIdentificationOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "stale_version" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "failed" };

function issuerIdentificationFromWire(row: IssuerIdentificationBody): IssuerIdentification {
  return {
    legalName: row.legal_name,
    grossIncomeRegistration: row.gross_income_registration,
    activityStartDate: row.activity_start_date,
    authorizedCuit: row.authorized_cuit,
    taxStatus: row.tax_status,
    version: row.version,
  };
}

export async function fetchIssuerIdentification(): Promise<FetchIssuerIdentificationOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/fiscal-settings/issuer-identification");
  } catch {
    return { kind: "failed" };
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
  if (!response.ok) {
    return { kind: "failed" };
  }
  const parsed = issuerIdentificationSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: issuerIdentificationFromWire(parsed.data) };
}

// The authorized CUIT and tax status are never sent: they are deployment configuration and a
// fixed value, never client input.
export async function saveIssuerIdentification(
  requestBody: IssuerIdentificationEditBody,
): Promise<SaveIssuerIdentificationOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/fiscal-settings/issuer-identification", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 409) {
    return { kind: "stale_version" };
  }
  if (response.status === 401) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "authorization_required"
      ? { kind: "authorization_required" }
      : { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  return { kind: "failed" };
}
