import {
  type PriceConfirmationBody,
  type PriceList,
  type PriceSetBody,
  priceListSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterSeconds } from "../platform/retry-after-seconds";

export type PricesReviewFilter = "pending" | "all";

export type FetchPricesInput = {
  review: PricesReviewFilter;
  categoryId?: string;
  search?: string;
};

export type FetchPricesOutcome = CloudReadOutcome<PriceList>;

type SetPriceFieldError = "unitPrice" | "expectedCurrentPriceId";

export type SetPriceInput = PriceSetBody;

export type SetPriceOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: SetPriceFieldError }
  | { kind: "price_unchanged" }
  | { kind: "stale_price" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type ConfirmPriceInput = PriceConfirmationBody;

export type ConfirmPriceOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed" }
  | { kind: "no_price_to_confirm" }
  | { kind: "stale_price" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

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
  const list = priceListSchema.safeParse(await response.json().catch(() => undefined));
  return list.success ? { kind: "ok", value: list.data } : { kind: "failed" };
}

export async function setPrice(productId: string, input: SetPriceInput): Promise<SetPriceOutcome> {
  let response: Response;
  try {
    response = await postJson(`/products/${productId}/price`, input);
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
    return { kind: "ok" };
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
