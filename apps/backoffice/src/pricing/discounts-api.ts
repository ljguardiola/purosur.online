import { type DiscountList, discountListSchema } from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterSeconds } from "../platform/retry-after-seconds";

export type FetchDiscountsOutcome = CloudReadOutcome<DiscountList>;

type RequestRefusal =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

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

export async function fetchDiscounts(): Promise<FetchDiscountsOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/discounts");
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = discountListSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}
