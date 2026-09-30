import {
  type TagCreationBody,
  type TagEditBody,
  type TagSummary,
  tagListSchema,
  tagSummarySchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterSeconds } from "../platform/retry-after-seconds";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type FetchTagsOutcome = CloudReadOutcome<TagSummary[]>;

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

export type EditTagInput = { name: string; version: number };

export type EditTagOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "name_taken" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | RequestRefusal;

export type ChangeTagActivationOutcome =
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
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  return { kind: "failed" };
}

export async function fetchTags(): Promise<FetchTagsOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/tags");
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = tagListSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

export async function createTag(input: { name: string }): Promise<CreateTagOutcome> {
  const requestBody: TagCreationBody = { name: input.name };
  let response: Response;
  try {
    response = await sendJson("POST", "/api/tags", requestBody);
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

export async function editTag(id: string, input: EditTagInput): Promise<EditTagOutcome> {
  const requestBody: TagEditBody = { name: input.name, version: input.version };
  let response: Response;
  try {
    response = await sendJson("PUT", `/api/tags/${id}`, requestBody);
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

async function changeTagActivation(
  id: string,
  method: "PUT" | "DELETE",
  alreadyChangedCode: string,
): Promise<ChangeTagActivationOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/tags/${id}/deactivation`, { method });
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

export function deactivateTag(id: string): Promise<ChangeTagActivationOutcome> {
  return changeTagActivation(id, "PUT", "tag_already_inactive");
}

export function reactivateTag(id: string): Promise<ChangeTagActivationOutcome> {
  return changeTagActivation(id, "DELETE", "tag_already_active");
}
