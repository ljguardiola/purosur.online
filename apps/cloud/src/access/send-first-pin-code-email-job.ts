import type { FirstPinCodeEmailSender } from "./recovery-email-sender.js";
import { type ReportRecoveryErrorDeps, reportRecoveryError } from "./recovery-error-reporting.js";

export interface FirstPinCodeEmailJobPayload {
  email: string;
  code: string;
  expiresAt: string;
}

export interface SendFirstPinCodeEmailJobDeps extends ReportRecoveryErrorDeps {
  emailSender: FirstPinCodeEmailSender;
  now: () => Date;
}

function isFirstPinCodeEmailJobPayload(payload: unknown): payload is FirstPinCodeEmailJobPayload {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  const candidate = payload as Partial<Record<keyof FirstPinCodeEmailJobPayload, unknown>>;
  return (
    typeof candidate.email === "string" &&
    typeof candidate.code === "string" &&
    typeof candidate.expiresAt === "string" &&
    !Number.isNaN(Date.parse(candidate.expiresAt))
  );
}

export async function sendFirstPinCodeEmailJob(
  payload: unknown,
  { emailSender, now, captureException }: SendFirstPinCodeEmailJobDeps,
): Promise<void> {
  if (!isFirstPinCodeEmailJobPayload(payload)) {
    throw new Error("first PIN code email: malformed job payload");
  }
  if (Date.parse(payload.expiresAt) <= now().getTime()) {
    return;
  }
  try {
    await emailSender.sendFirstPinCode({ to: payload.email, code: payload.code });
  } catch (error) {
    reportRecoveryError(
      "first PIN code: sending the email failed",
      error,
      captureException ? { captureException } : {},
    );
    throw error;
  }
}
