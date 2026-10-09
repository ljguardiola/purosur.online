import type { DeviceCredentials } from "@purosur/contracts";
import {
  type CloudError,
  type OpenCashSession,
  type PinCodeRedemption,
  type PinCodeRedemptionOutcome,
  pinCodeRedemptionBodySchema,
  pinCodeRedemptionSchema,
  retryAfterSecondsOf,
} from "@purosur/contracts";
import { isAcceptablePin, isLockedToAnother } from "@purosur/domain";
import type { CloudResponse } from "../platform/cloud-client";

export interface PinCodeRedemptionDeps {
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  postToCloud:
    | ((path: string, bearerToken: string, body: unknown) => Promise<CloudResponse>)
    | undefined;
  applyRedeemedPin: ((pepper: string, redemption: PinCodeRedemption) => void) | undefined;
  reportLocalFailure: (error: unknown) => void;
  openCashSession: () => { openedBy: string } | undefined;
  redeemedPerson: (
    userId: string,
  ) => Extract<PinCodeRedemptionOutcome, { kind: "resumed" }>["person"] | undefined;
  signedInPerson: { set(userId: string): void };
  cashSession: (signedInPersonId: string) => OpenCashSession | null;
}

function refusalOutcome(error: CloudError): PinCodeRedemptionOutcome {
  switch (error.code) {
    case "reset_code_invalid":
      return { kind: "code_invalid" };
    case "reset_code_expired":
      return { kind: "code_expired" };
    case "reset_code_burned":
      return { kind: "code_burned" };
    case "rate_limited":
      return { kind: "rate_limited", retry_after_seconds: retryAfterSecondsOf(error) ?? 0 };
    case "validation_failed": {
      const fields = error.details.map((detail) => detail["field"]);
      if (fields.includes("new_pin")) {
        return { kind: "pin_rejected" };
      }
      return fields.includes("reset_code") ? { kind: "code_invalid" } : { kind: "unavailable" };
    }
    default:
      return { kind: "unavailable" };
  }
}

function refusedFields(
  codeIsWellFormed: boolean,
  newPin: string,
): Extract<PinCodeRedemptionOutcome, { kind: "invalid_input" }>["fields"] {
  const fields: ("reset_code" | "new_pin")[] = [];
  if (!codeIsWellFormed) {
    fields.push("reset_code");
  }
  if (!isAcceptablePin(newPin)) {
    fields.push("new_pin");
  }
  return fields;
}

export function checkPinCodeRedemption(
  typedCode: string,
  newPin: string,
): ("reset_code" | "new_pin")[] {
  const request = pinCodeRedemptionBodySchema.safeParse({ reset_code: typedCode, new_pin: newPin });
  return refusedFields(request.success, newPin);
}

export async function redeemPinCode(
  deps: PinCodeRedemptionDeps,
  typedCode: string,
  newPin: string,
): Promise<PinCodeRedemptionOutcome> {
  const request = pinCodeRedemptionBodySchema.safeParse({ reset_code: typedCode, new_pin: newPin });
  if (!request.success || !isAcceptablePin(newPin)) {
    return { kind: "invalid_input", fields: refusedFields(request.success, newPin) };
  }
  const { postToCloud, applyRedeemedPin } = deps;
  const credentials = await deps.readCredentials();
  // Redeeming burns the code, so it is only sent once the answer has somewhere to go.
  if (postToCloud === undefined || applyRedeemedPin === undefined || credentials === undefined) {
    return { kind: "unavailable" };
  }

  const response = await postToCloud(
    "/api/pin-code-redemptions",
    credentials.device_token,
    request.data,
  );
  if (response.kind === "unreachable") {
    return { kind: "unreachable" };
  }
  if (response.kind === "error") {
    return refusalOutcome(response.error);
  }
  const redemption = pinCodeRedemptionSchema.safeParse(response.body);
  if (!redemption.success) {
    return { kind: "unavailable" };
  }

  // The cloud already keeps the new PIN and the code is spent, so the redemption stands even when
  // this register fails to keep it: its next users pull brings the same hash.
  try {
    applyRedeemedPin(credentials.pepper, redemption.data);
  } catch (error) {
    deps.reportLocalFailure(error);
  }
  const openSession = deps.openCashSession();
  if (openSession === undefined) {
    return { kind: "redeemed" };
  }
  if (isLockedToAnother(openSession, redemption.data.user_id)) {
    return { kind: "cash_session_opened_by_another" };
  }
  const person = deps.redeemedPerson(openSession.openedBy);
  if (person === undefined) {
    return { kind: "redeemed" };
  }
  const cashSession = deps.cashSession(openSession.openedBy);
  deps.signedInPerson.set(openSession.openedBy);
  return { kind: "resumed", person, cash_session: cashSession };
}
