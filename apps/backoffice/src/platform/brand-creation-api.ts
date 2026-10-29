import { type BrandCreationBody, type BrandSummary, brandSummarySchema } from "@purosur/contracts";
import { rateLimitOutcome } from "./rate-limit-outcome";
import { readValidationFailedField } from "./validation-failed-field";

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

export async function createBrand(input: { name: string }): Promise<CreateBrandOutcome> {
  const requestBody: BrandCreationBody = { name: input.name };
  let response: Response;
  try {
    response = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
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
