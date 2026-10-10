import {
  type SupplierCreationBody,
  type SupplierEditBody,
  type SupplierSummary,
  supplierListSchema,
  supplierSummarySchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type FetchSuppliersOutcome = CloudReadOutcome<SupplierSummary[]>;

type RequestRefusal =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type CreateSupplierOutcome =
  | { kind: "ok"; supplier: SupplierSummary }
  | { kind: "validation_failed"; field: string }
  | { kind: "name_taken" }
  | { kind: "cuit_taken" }
  | RequestRefusal;

export type EditSupplierOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "name_taken" }
  | { kind: "cuit_taken" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | RequestRefusal;

export type ChangeSupplierActivationOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "already_changed" }
  | RequestRefusal;

function sendJson(method: "POST" | "PUT", path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readCode(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
  return body?.code;
}

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

export async function fetchSuppliers(): Promise<FetchSuppliersOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/suppliers");
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = supplierListSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

async function conflict(
  response: Response,
): Promise<
  { kind: "name_taken" } | { kind: "cuit_taken" } | { kind: "stale_version" } | { kind: "failed" }
> {
  const code = await readCode(response);
  if (code === "supplier_name_taken") {
    return { kind: "name_taken" };
  }
  if (code === "supplier_cuit_taken") {
    return { kind: "cuit_taken" };
  }
  return code === "stale_version" ? { kind: "stale_version" } : { kind: "failed" };
}

export async function createSupplier(input: SupplierCreationBody): Promise<CreateSupplierOutcome> {
  const requestBody: SupplierCreationBody = {
    name: input.name,
    cuit: input.cuit,
    contact: input.contact,
    note: input.note,
  };
  let response: Response;
  try {
    response = await sendJson("POST", "/api/suppliers", requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = supplierSummarySchema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? { kind: "ok", supplier: parsed.data } : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 409) {
    const outcome = await conflict(response);
    return outcome.kind === "stale_version" ? { kind: "failed" } : outcome;
  }
  return refusal(response);
}

export async function editSupplier(
  id: string,
  input: SupplierEditBody,
): Promise<EditSupplierOutcome> {
  const requestBody: SupplierEditBody = {
    name: input.name,
    cuit: input.cuit,
    contact: input.contact,
    note: input.note,
    version: input.version,
  };
  let response: Response;
  try {
    response = await sendJson("PUT", `/api/suppliers/${id}`, requestBody);
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
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    return conflict(response);
  }
  return refusal(response);
}

async function changeSupplierActivation(
  id: string,
  method: "PUT" | "DELETE",
  alreadyChangedCode: string,
): Promise<ChangeSupplierActivationOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/suppliers/${id}/deactivation`, { method });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    return (await readCode(response)) === alreadyChangedCode
      ? { kind: "already_changed" }
      : { kind: "failed" };
  }
  return refusal(response);
}

export function deactivateSupplier(id: string): Promise<ChangeSupplierActivationOutcome> {
  return changeSupplierActivation(id, "PUT", "supplier_already_inactive");
}

export function reactivateSupplier(id: string): Promise<ChangeSupplierActivationOutcome> {
  return changeSupplierActivation(id, "DELETE", "supplier_already_active");
}
