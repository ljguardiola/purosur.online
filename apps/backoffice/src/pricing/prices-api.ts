import {
  type PriceConfirmationBody,
  type PriceList,
  type PriceSetBody,
  priceListSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterSeconds } from "../platform/retry-after-seconds";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type PricesReviewFilter = "pending" | "all";

export type FetchPricesInput = {
  review: PricesReviewFilter;
  categoryId?: string;
  search?: string;
};

export type FetchPricesOutcome = CloudReadOutcome<PriceList>;

export type SetPriceInput = PriceSetBody;

export type SetPriceOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
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
    const field = await readValidationFailedField(response.clone());
    if (field !== undefined) {
      return { kind: "validation_failed", field };
    }
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "price_unchanged" ? { kind: "price_unchanged" } : { kind: "failed" };
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
