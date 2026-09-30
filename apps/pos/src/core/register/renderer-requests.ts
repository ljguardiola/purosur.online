import type {
  CoreToRendererMessage,
  EnrollmentOutcome,
  PinCodeRedemptionOutcome,
  RendererToCoreMessage,
} from "@purosur/contracts";

export interface RendererRequestDeps {
  credentialsPresent: () => Promise<boolean>;
  enroll: (typedCode: string) => Promise<EnrollmentOutcome>;
  redeemPinCode: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
}

export async function answerRendererRequest(
  deps: RendererRequestDeps,
  message: RendererToCoreMessage,
): Promise<CoreToRendererMessage | undefined> {
  switch (message.type) {
    case "enrollment-status-request":
      return {
        type: "enrollment-status",
        request_id: message.request_id,
        enrolled: await deps.credentialsPresent(),
      };
    case "enroll":
      return {
        type: "enrollment-result",
        request_id: message.request_id,
        outcome: await deps.enroll(message.code),
      };
    case "redeem-pin-code":
      return {
        type: "pin-code-redemption-result",
        request_id: message.request_id,
        outcome: await deps.redeemPinCode(message.reset_code, message.new_pin),
      };
    case "ping":
      return undefined;
  }
}
