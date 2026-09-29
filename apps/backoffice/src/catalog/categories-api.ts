import {
  type CategoryCreationBody,
  type CategoryEditBody,
  type CategorySummary,
  categoryListSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterSeconds } from "../platform/retry-after-seconds";

export type FetchCategoriesOutcome = CloudReadOutcome<CategorySummary[]>;

export type CreateCategoryInput = { name: string; parentId: string | null };

type CreateCategoryFieldError = "name" | "parentId";

export type CreateCategoryOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: CreateCategoryFieldError }
  | { kind: "name_taken" }
  | { kind: "parent_has_products" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type EditCategoryInput = { name: string; parentId: string | null; version: number };

type EditCategoryFieldError = "name" | "parentId" | "version";

export type EditCategoryOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: EditCategoryFieldError }
  | { kind: "name_taken" }
  | { kind: "parent_has_products" }
  | { kind: "move_not_allowed" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function categoryFieldFromWire(field: unknown): "name" | "parentId" | "version" | undefined {
  return field === "name" || field === "parentId" || field === "version" ? field : undefined;
}

export async function fetchCategories(): Promise<FetchCategoriesOutcome> {
  let response: Response;
  try {
    response = await fetch("/categories");
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
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const parsed = categoryListSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: parsed.data };
}

export async function createCategory(input: CreateCategoryInput): Promise<CreateCategoryOutcome> {
  const requestBody: CategoryCreationBody = { name: input.name, parentId: input.parentId };
  let response: Response;
  try {
    response = await postJson("/categories", requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; details?: Array<{ field?: string }> }
      | undefined;
    if (body?.code === "validation_failed") {
      const field = categoryFieldFromWire(body.details?.[0]?.field);
      if (field === "name" || field === "parentId") {
        return { kind: "validation_failed", field };
      }
    }
    return { kind: "failed" };
  }
  if (response.status === 409) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "category_parent_has_products"
      ? { kind: "parent_has_products" }
      : { kind: "name_taken" };
  }
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

export async function editCategory(
  id: string,
  input: EditCategoryInput,
): Promise<EditCategoryOutcome> {
  const requestBody: CategoryEditBody = {
    name: input.name,
    parentId: input.parentId,
    version: input.version,
  };
  let response: Response;
  try {
    response = await postJson(`/categories/${id}/edit`, requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; details?: Array<{ field?: string }> }
      | undefined;
    if (body?.code === "validation_failed") {
      const field = categoryFieldFromWire(body.details?.[0]?.field);
      if (field) {
        return { kind: "validation_failed", field };
      }
    }
    return { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    if (body?.code === "stale_version") {
      return { kind: "stale_version" };
    }
    if (body?.code === "category_parent_has_products") {
      return { kind: "parent_has_products" };
    }
    if (body?.code === "category_move_not_allowed") {
      return { kind: "move_not_allowed" };
    }
    return { kind: "name_taken" };
  }
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
