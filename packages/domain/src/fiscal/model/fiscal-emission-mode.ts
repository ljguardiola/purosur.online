import type { LatestPreEmissionGateOutcome } from "./fiscal-emission-stop.js";
import {
  type DeferralReason,
  decideSaleAuthorizationRoute,
  type OfflineAuthorizationCause,
  type SaleAuthorizationPathInput,
} from "./real-time-authorization.js";

export const FISCAL_EMISSION_MODE_KINDS = ["real_time", "offline_code", "deferring"] as const;

export type FiscalEmissionModeKind = (typeof FISCAL_EMISSION_MODE_KINDS)[number];

export const FISCAL_AUTHORIZATIONS = ["real_time", "offline_code"] as const;

export type FiscalAuthorization = (typeof FISCAL_AUTHORIZATIONS)[number];

export type FiscalEmissionMode =
  | { kind: "real_time" }
  | { kind: "offline_code"; cause: OfflineAuthorizationCause }
  | { kind: "deferring"; reason: DeferralReason };

export interface FiscalEmissionModeInput extends Omit<SaleAuthorizationPathInput, "occurredAt"> {
  latestGate: LatestPreEmissionGateOutcome | undefined;
}

export function fiscalEmissionModeOf({
  latestGate,
  ...input
}: FiscalEmissionModeInput): FiscalEmissionMode {
  const route = decideSaleAuthorizationRoute({
    ...input,
    occurredAt: input.now,
    gate: latestGate?.kind === "failed" ? latestGate : { kind: "passed", document: null },
  });
  switch (route.kind) {
    case "reserve":
      return { kind: "real_time" };
    case "issue_offline":
      return { kind: "offline_code", cause: route.cause };
    case "defer":
      return { kind: "deferring", reason: route.reason };
  }
}
