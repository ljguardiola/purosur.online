import {
  type PackagingCreationBody,
  type PackagingEditBody,
  type PackagingList,
  type PackagingSummary,
  packagingListSchema,
  packagingSummarySchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type FetchPackagingsOutcome = CloudReadOutcome<PackagingList>;

type RequestRefusal =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type CreatePackagingOutcome =
  | { kind: "ok"; packaging: PackagingSummary }
  | { kind: "validation_failed"; field: string }
  | { kind: "product_not_found" }
  | { kind: "name_taken" }
  | RequestRefusal;

export type EditPackagingOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "name_taken" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | RequestRefusal;

export type ChangePackagingActivationOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "already_changed" }
  | RequestRefusal;

export type ReactivatePackagingOutcome =
  | ChangePackagingActivationOutcome
  | { kind: "sale_unit_changed" };

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

export async function fetchPackagings(): Promise<FetchPackagingsOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/purchase-packagings");
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = packagingListSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

export async function createPackaging(
  input: PackagingCreationBody,
): Promise<CreatePackagingOutcome> {
  const requestBody: PackagingCreationBody = {
    productId: input.productId,
    name: input.name,
    quantityPerPackage: input.quantityPerPackage,
  };
  let response: Response;
  try {
    response = await sendJson("POST", "/api/purchase-packagings", requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = packagingSummarySchema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? { kind: "ok", packaging: parsed.data } : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 404) {
    return { kind: "product_not_found" };
  }
  if (response.status === 409) {
    return (await readCode(response)) === "packaging_name_taken"
      ? { kind: "name_taken" }
      : { kind: "failed" };
  }
  return refusal(response);
}

export async function editPackaging(
  id: string,
  input: PackagingEditBody,
): Promise<EditPackagingOutcome> {
  const requestBody: PackagingEditBody = {
    name: input.name,
    quantityPerPackage: input.quantityPerPackage,
    version: input.version,
  };
  let response: Response;
  try {
    response = await sendJson("PUT", `/api/purchase-packagings/${id}`, requestBody);
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
    const code = await readCode(response);
    if (code === "stale_version") {
      return { kind: "stale_version" };
    }
    return code === "packaging_name_taken" ? { kind: "name_taken" } : { kind: "failed" };
  }
  return refusal(response);
}

async function changePackagingActivation<TConflict extends { kind: string }>(
  id: string,
  method: "PUT" | "DELETE",
  conflictOf: (code: string | undefined) => TConflict | { kind: "failed" },
): Promise<{ kind: "ok" } | { kind: "not_found" } | TConflict | RequestRefusal> {
  let response: Response;
  try {
    response = await fetch(`/api/purchase-packagings/${id}/deactivation`, { method });
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
    return conflictOf(await readCode(response));
  }
  return refusal(response);
}

export function deactivatePackaging(id: string): Promise<ChangePackagingActivationOutcome> {
  return changePackagingActivation(id, "PUT", (code) =>
    code === "packaging_already_inactive"
      ? { kind: "already_changed" as const }
      : { kind: "failed" as const },
  );
}

export function reactivatePackaging(id: string): Promise<ReactivatePackagingOutcome> {
  return changePackagingActivation(id, "DELETE", (code) => {
    if (code === "packaging_already_active") {
      return { kind: "already_changed" as const };
    }
    return code === "packaging_sale_unit_changed"
      ? { kind: "sale_unit_changed" as const }
      : { kind: "failed" as const };
  });
}
