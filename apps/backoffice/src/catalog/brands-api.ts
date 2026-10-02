import {
  type BrandCreationBody,
  type BrandEditBody,
  type BrandSummary,
  brandListSchema,
  brandSummarySchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type FetchBrandsOutcome = CloudReadOutcome<BrandSummary[]>;

type RequestRefusal =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type CreateBrandOutcome =
  | { kind: "ok"; brand: BrandSummary }
  | { kind: "validation_failed"; field: string }
  | { kind: "name_taken" }
  | RequestRefusal;

export type EditBrandInput = { name: string; version: number };

export type EditBrandOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "name_taken" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | RequestRefusal;

export type ChangeBrandActivationOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "already_changed" }
  | RequestRefusal;

function sendJson(method: "POST" | "PUT", path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function postJson(path: string, body?: unknown): Promise<Response> {
  return sendJson("POST", path, body);
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

export async function fetchBrands(): Promise<FetchBrandsOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/brands");
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = brandListSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

export async function createBrand(input: { name: string }): Promise<CreateBrandOutcome> {
  const requestBody: BrandCreationBody = { name: input.name };
  let response: Response;
  try {
    response = await postJson("/api/brands", requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = brandSummarySchema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? { kind: "ok", brand: parsed.data } : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 409) {
    return { kind: "name_taken" };
  }
  return refusal(response);
}

export async function editBrand(id: string, input: EditBrandInput): Promise<EditBrandOutcome> {
  const requestBody: BrandEditBody = { name: input.name, version: input.version };
  let response: Response;
  try {
    response = await sendJson("PUT", `/api/brands/${id}`, requestBody);
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
    return (await readCode(response)) === "stale_version"
      ? { kind: "stale_version" }
      : { kind: "name_taken" };
  }
  return refusal(response);
}

async function changeBrandActivation(
  id: string,
  method: "PUT" | "DELETE",
  alreadyChangedCode: string,
): Promise<ChangeBrandActivationOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/brands/${id}/deactivation`, { method });
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

export function deactivateBrand(id: string): Promise<ChangeBrandActivationOutcome> {
  return changeBrandActivation(id, "PUT", "brand_already_inactive");
}

export function reactivateBrand(id: string): Promise<ChangeBrandActivationOutcome> {
  return changeBrandActivation(id, "DELETE", "brand_already_active");
}
