import type { ProductSaleUnit } from "./productsApi";

const ROLLING_HOUR_RATE_LIMIT_FALLBACK_SECONDS = 60 * 60;

export type PriceRow = { id: string; unitPrice: number; validFrom: string };

export type PriceProduct = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  saleUnit: ProductSaleUnit;
  currentPrice: PriceRow | null;
  lastReviewedAt: string | null;
  pending: boolean;
};

export type PricesReviewFilter = "pending" | "all";

export type FetchPricesInput = {
  review: PricesReviewFilter;
  categoryId?: string;
  search?: string;
};

export type PriceCategory = { id: string; name: string };

export type PricesList = {
  products: PriceProduct[];
  pendingCount: number;
  reviewWindowDays: number;
  categories: PriceCategory[];
};

export type FetchPricesOutcome =
  | { kind: "ok"; value: PricesList }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type SetPriceFieldError = "unitPrice" | "expectedCurrentPriceId";

export type SetPriceInput = {
  unitPrice: number;
  /** `null` when the caller saw no current price yet. */
  expectedCurrentPriceId: string | null;
};

export type SetPriceOutcome =
  | { kind: "ok"; value: { price: PriceRow; lastReviewedAt: string } }
  | { kind: "validation_failed"; field: SetPriceFieldError }
  | { kind: "price_unchanged" }
  | { kind: "stale_price" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type ConfirmPriceInput = { expectedCurrentPriceId: string };

export type ConfirmPriceOutcome =
  | { kind: "ok"; value: { lastReviewedAt: string } }
  | { kind: "validation_failed" }
  | { kind: "no_price_to_confirm" }
  | { kind: "stale_price" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function retryAfterSeconds(response: Response): number {
  const header = response.headers.get("Retry-After");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0
    ? seconds
    : ROLLING_HOUR_RATE_LIMIT_FALLBACK_SECONDS;
}

function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setPriceFieldFromWire(field: unknown): SetPriceFieldError | undefined {
  return field === "unitPrice" || field === "expectedCurrentPriceId" ? field : undefined;
}

export async function fetchPrices(input: FetchPricesInput): Promise<FetchPricesOutcome> {
  const query = new URLSearchParams({ review: input.review });
  if (input.categoryId) {
    query.set("categoryId", input.categoryId);
  }
  if (input.search) {
    query.set("search", input.search);
  }

  let response: Response;
  try {
    response = await fetch(`/prices?${query.toString()}`);
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
  const body = (await response.json().catch(() => undefined)) as PricesList | undefined;
  if (!body || !Array.isArray(body.products) || !Array.isArray(body.categories)) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: body };
}

export async function setPrice(productId: string, input: SetPriceInput): Promise<SetPriceOutcome> {
  let response: Response;
  try {
    response = await postJson(`/products/${productId}/price`, input);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { price: PriceRow; lastReviewedAt: string }
      | undefined;
    if (!body) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: body };
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; details?: Array<{ field?: string }> }
      | undefined;
    if (body?.code === "price_unchanged") {
      return { kind: "price_unchanged" };
    }
    const field = setPriceFieldFromWire(body?.details?.[0]?.field);
    if (field) {
      return { kind: "validation_failed", field };
    }
    return { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    return { kind: "stale_price" };
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

export async function confirmPrice(
  productId: string,
  input: ConfirmPriceInput,
): Promise<ConfirmPriceOutcome> {
  let response: Response;
  try {
    response = await postJson(`/products/${productId}/price-confirmation`, input);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { lastReviewedAt: string }
      | undefined;
    if (!body) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: body };
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    if (body?.code === "no_price_to_confirm") {
      return { kind: "no_price_to_confirm" };
    }
    return { kind: "validation_failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    return { kind: "stale_price" };
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
