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

export type IssuerIdentificationWire = {
  legal_name: string | null;
  gross_income_registration: string | null;
  activity_start_date: string | null;
  authorized_cuit: string;
  tax_status: string;
  version: number;
};

export type IssuerIdentificationField =
  | "legal_name"
  | "gross_income_registration"
  | "activity_start_date"
  | "version";

export type FetchIssuerIdentificationOutcome =
  | { kind: "ok"; value: IssuerIdentification }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "failed" };

export type SaveIssuerIdentificationInput = {
  legalName: string;
  grossIncomeRegistration: string;
  /** A zero-padded ISO calendar date (YYYY-MM-DD), never in the future. */
  activityStartDate: string;
  version: number;
};

export type SaveIssuerIdentificationOutcome =
  | { kind: "ok"; value: IssuerIdentification }
  | { kind: "validation_failed"; field: IssuerIdentificationField }
  | { kind: "stale_version" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "failed" };

function issuerIdentificationFromWire(row: IssuerIdentificationWire): IssuerIdentification {
  return {
    legalName: row.legal_name,
    grossIncomeRegistration: row.gross_income_registration,
    activityStartDate: row.activity_start_date,
    authorizedCuit: row.authorized_cuit,
    taxStatus: row.tax_status,
    version: row.version,
  };
}

function issuerIdentificationFieldFromWire(field: unknown): IssuerIdentificationField | undefined {
  const fields: readonly IssuerIdentificationField[] = [
    "legal_name",
    "gross_income_registration",
    "activity_start_date",
    "version",
  ];
  return fields.find((candidate) => candidate === field);
}

/** Reads the business's one issuer identification, gated by `change_fiscal_configuration` (`GET /fiscal-configuration/issuer-identification`). */
export async function fetchIssuerIdentification(): Promise<FetchIssuerIdentificationOutcome> {
  let response: Response;
  try {
    response = await fetch("/fiscal-configuration/issuer-identification");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = (await response.json().catch(() => undefined)) as
    | IssuerIdentificationWire
    | undefined;
  if (!body) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: issuerIdentificationFromWire(body) };
}

/**
 * Saves the issuer identification, rejecting a save over a version someone else already changed,
 * gated by the shared passkey-authorization window (`PUT /fiscal-configuration/issuer-identification`).
 * The authorized CUIT and tax status are never sent: they are deployment configuration and a fixed
 * value, never something this route accepts from a client.
 */
export async function saveIssuerIdentification(
  input: SaveIssuerIdentificationInput,
): Promise<SaveIssuerIdentificationOutcome> {
  let response: Response;
  try {
    response = await fetch("/fiscal-configuration/issuer-identification", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        legal_name: input.legalName,
        gross_income_registration: input.grossIncomeRegistration,
        activity_start_date: input.activityStartDate,
        version: input.version,
      }),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | IssuerIdentificationWire
      | undefined;
    if (!body) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: issuerIdentificationFromWire(body) };
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; details?: Array<{ field?: string }> }
      | undefined;
    if (body?.code === "validation_failed") {
      const field = issuerIdentificationFieldFromWire(body.details?.[0]?.field);
      if (field) {
        return { kind: "validation_failed", field };
      }
    }
    return { kind: "failed" };
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
