import {
  type BuyerIdentificationThresholdBody,
  type BuyerIdentificationThresholdRecordBody,
  buyerIdentificationThresholdConfirmationRequiredSchema,
  buyerIdentificationThresholdOverviewSchema,
  buyerIdentificationThresholdSchema,
} from "@purosur/contracts";
import type { BuyerIdentificationThreshold } from "@purosur/domain";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type ShownBuyerIdentificationThreshold = Omit<BuyerIdentificationThreshold, "revision">;

export type BuyerIdentificationThresholds = {
  inEffect: ShownBuyerIdentificationThreshold | null;
  scheduled: ShownBuyerIdentificationThreshold | null;
  earliestValidFrom: string;
};

export type FetchBuyerIdentificationThresholdsOutcome =
  CloudReadOutcome<BuyerIdentificationThresholds>;

export type RecordBuyerIdentificationThresholdOutcome =
  | { kind: "ok"; value: ShownBuyerIdentificationThreshold }
  | { kind: "validation_failed"; field: string }
  | { kind: "before_today" }
  | { kind: "needs_confirmation"; inEffectAmount: number; amount: number; validFrom: string }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "failed" };

function thresholdFromWire(
  row: BuyerIdentificationThresholdBody,
): ShownBuyerIdentificationThreshold {
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
  const { in_effect, scheduled, earliest_valid_from } = parsed.data;
  return {
    kind: "ok",
    value: {
      inEffect: in_effect && thresholdFromWire(in_effect),
      scheduled: scheduled && thresholdFromWire(scheduled),
      earliestValidFrom: earliest_valid_from,
    },
  };
}

async function bodyOf(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

function codeOf(body: unknown): unknown {
  return (body as { code?: unknown } | undefined)?.code;
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
    const body = await bodyOf(response);
    if (codeOf(body) === "threshold_before_today") {
      return { kind: "before_today" };
    }
    const confirmation = buyerIdentificationThresholdConfirmationRequiredSchema.safeParse(body);
    return confirmation.success
      ? {
          kind: "needs_confirmation",
          inEffectAmount: confirmation.data.in_effect_amount,
          amount: confirmation.data.amount,
          validFrom: confirmation.data.valid_from,
        }
      : { kind: "failed" };
  }
  if (response.status === 401) {
    return codeOf(await bodyOf(response)) === "authorization_required"
      ? { kind: "authorization_required" }
      : { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  return { kind: "failed" };
}
