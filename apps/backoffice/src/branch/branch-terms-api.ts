import {
  goodConditionReturnDaysBodySchema,
  supplierPriceListDailyCapBodySchema,
} from "@purosur/contracts";
import { cloudFetch } from "../platform/cloud-fetch";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";

async function readTerm(
  path: string,
  valueOf: (body: unknown) => number | undefined,
): Promise<CloudReadOutcome<number>> {
  let response: Response;
  try {
    response = await cloudFetch(path);
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
    return rateLimitOutcome(response);
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const value = valueOf(await response.json().catch(() => undefined));
  return value === undefined ? { kind: "failed" } : { kind: "ok", value };
}

export function fetchGoodConditionReturnDays(): Promise<CloudReadOutcome<number>> {
  return readTerm("/api/locations/current/good-condition-return-days", (body) => {
    const parsed = goodConditionReturnDaysBodySchema.safeParse(body);
    return parsed.success ? parsed.data.good_condition_return_days : undefined;
  });
}

export function fetchSupplierPriceListDailyCap(): Promise<CloudReadOutcome<number>> {
  return readTerm("/api/locations/current/supplier-price-list-daily-cap", (body) => {
    const parsed = supplierPriceListDailyCapBodySchema.safeParse(body);
    return parsed.success ? parsed.data.supplier_price_list_daily_extraction_cap : undefined;
  });
}
