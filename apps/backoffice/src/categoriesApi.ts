// The backoffice API rate limiter counts a rolling one-hour window, the same fallback
// rolesApi.ts's own rate-limited outcomes fall back to.
const RATE_LIMIT_FALLBACK_SECONDS = 60 * 60;

export type CategorySummary = {
  id: string;
  name: string;
  version: number;
};

export type FetchCategoriesOutcome =
  | { kind: "ok"; value: CategorySummary[] }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type CreateCategoryInput = { name: string };

export type CreateCategoryFieldError = "name";

export type CreateCategoryOutcome =
  | { kind: "ok"; value: CategorySummary }
  | { kind: "validation_failed"; field: CreateCategoryFieldError }
  | { kind: "name_taken" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type EditCategoryInput = { name: string; version: number };

export type EditCategoryFieldError = "name" | "version";

export type EditCategoryOutcome =
  | { kind: "ok"; value: CategorySummary }
  | { kind: "validation_failed"; field: EditCategoryFieldError }
  | { kind: "name_taken" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function retryAfterSeconds(response: Response): number {
  const header = response.headers.get("Retry-After");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : RATE_LIMIT_FALLBACK_SECONDS;
}

function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function categoryFieldFromWire(field: unknown): "name" | "version" | undefined {
  return field === "name" || field === "version" ? field : undefined;
}

/** Lists every catalog category, gated by `manage_products_and_categories` (`GET /categories`). */
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
  const body = (await response.json().catch(() => undefined)) as CategorySummary[] | undefined;
  if (!Array.isArray(body)) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: body };
}

/** Creates a category, gated by `manage_products_and_categories`; no passkey step-up (`POST /categories`). */
export async function createCategory(input: CreateCategoryInput): Promise<CreateCategoryOutcome> {
  let response: Response;
  try {
    response = await postJson("/categories", { name: input.name });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => undefined)) as CategorySummary | undefined;
    if (!body) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: body };
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; details?: Array<{ field?: string }> }
      | undefined;
    if (body?.code === "validation_failed") {
      const field = categoryFieldFromWire(body.details?.[0]?.field);
      if (field === "name") {
        return { kind: "validation_failed", field };
      }
    }
    return { kind: "failed" };
  }
  if (response.status === 409) {
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

/** Renames a category, rejecting a save over a newer version, gated by `manage_products_and_categories`; no passkey step-up (`POST /categories/:id/edit`). */
export async function editCategory(
  id: string,
  input: EditCategoryInput,
): Promise<EditCategoryOutcome> {
  let response: Response;
  try {
    response = await postJson(`/categories/${id}/edit`, {
      name: input.name,
      version: input.version,
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => undefined)) as CategorySummary | undefined;
    if (!body) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: body };
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
    return body?.code === "stale_version" ? { kind: "stale_version" } : { kind: "name_taken" };
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
