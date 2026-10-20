import {
  type DeferralReason,
  type OfflineAuthorizationCause,
  type SaleAuthorizationPathInput,
  saleAuthorizationPath,
} from "./real-time-authorization.js";

export const FISCAL_EMISSION_MODE_KINDS = ["real_time", "offline_code", "deferring"] as const;

export type FiscalEmissionModeKind = (typeof FISCAL_EMISSION_MODE_KINDS)[number];

export const FISCAL_AUTHORIZATIONS = ["real_time", "offline_code"] as const;

export type FiscalAuthorization = (typeof FISCAL_AUTHORIZATIONS)[number];

export type FiscalEmissionMode =
  | { kind: "real_time" }
  | { kind: "offline_code"; cause: OfflineAuthorizationCause }
  | { kind: "deferring"; reason: DeferralReason };

export type FiscalEmissionModeInput = Omit<SaleAuthorizationPathInput, "occurredAt">;

export function fiscalEmissionModeOf(input: FiscalEmissionModeInput): FiscalEmissionMode {
  const path = saleAuthorizationPath({ ...input, occurredAt: input.now });
  switch (path.kind) {
    case "reserve":
      return { kind: "real_time" };
    case "issue_offline":
      return { kind: "offline_code", cause: path.cause };
    case "defer":
      return { kind: "deferring", reason: path.reason };
  }
}
