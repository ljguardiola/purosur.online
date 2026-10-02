import {
  type BuyerIdentificationThresholdBody,
  type BuyerIdentificationThresholdRecordBody,
  buyerIdentificationThresholdOverviewSchema,
  buyerIdentificationThresholdSchema,
} from "@purosur/contracts";
import type { BuyerIdentificationThreshold } from "@purosur/domain";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type BuyerIdentificationThresholds = {
  inEffect: BuyerIdentificationThreshold | null;
  scheduled: BuyerIdentificationThreshold | null;
  latestValidFrom: string | null;
};

export type FetchBuyerIdentificationThresholdsOutcome =
  CloudReadOutcome<BuyerIdentificationThresholds>;

export type RecordBuyerIdentificationThresholdOutcome =
  | { kind: "ok"; value: BuyerIdentificationThreshold }
  | { kind: "validation_failed"; field: string }
  | { kind: "not_after_latest" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "failed" };

function thresholdFromWire(row: BuyerIdentificationThresholdBody): BuyerIdentificationThreshold {
  return { id: row.id, amount: row.amount, validFrom: row.valid_from };
}

export async function fetchBuyerIdentificationThresholds(): Promise<FetchBuyerIdentificationThresholdsOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/buyer-identification-thresholds");
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
  const parsed = buyerIdentificationThresholdOverviewSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return { kind: "failed" };
  }
  const { in_effect, scheduled, latest_valid_from } = parsed.data;
  return {
    kind: "ok",
    value: {
      inEffect: in_effect && thresholdFromWire(in_effect),
      scheduled: scheduled && thresholdFromWire(scheduled),
      latestValidFrom: latest_valid_from,
    },
  };
}

async function codeOf(response: Response): Promise<unknown> {
  const body = (await response.json().catch(() => undefined)) as { code?: unknown } | undefined;
  return body?.code;
}

export async function recordBuyerIdentificationThreshold(
  requestBody: BuyerIdentificationThresholdRecordBody,
): Promise<RecordBuyerIdentificationThresholdOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/buyer-identification-thresholds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = buyerIdentificationThresholdSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return parsed.success
      ? { kind: "ok", value: thresholdFromWire(parsed.data) }
      : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 409) {
    return (await codeOf(response)) === "threshold_not_after_latest"
      ? { kind: "not_after_latest" }
      : { kind: "failed" };
  }
  if (response.status === 401) {
    return (await codeOf(response)) === "authorization_required"
      ? { kind: "authorization_required" }
      : { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  return { kind: "failed" };
}
