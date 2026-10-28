import { type TagCreationBody, type TagSummary, tagSummarySchema } from "@purosur/contracts";
import { rateLimitOutcome } from "./rate-limit-outcome";
import { readValidationFailedField } from "./validation-failed-field";

type RequestRefusal =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type CreateTagOutcome =
  | { kind: "ok"; tag: TagSummary }
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

export async function createTag(input: { name: string }): Promise<CreateTagOutcome> {
  const requestBody: TagCreationBody = { name: input.name };
  let response: Response;
  try {
    response = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = tagSummarySchema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? { kind: "ok", tag: parsed.data } : { kind: "failed" };
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
