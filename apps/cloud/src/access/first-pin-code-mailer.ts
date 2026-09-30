import {
  FirstPinCodeEmailUnavailable,
  type FirstPinCodeMailer,
} from "@purosur/domain/access/use-cases";
import type { FirstPinCodeEmailSender } from "./recovery-email-sender.js";
import { type ReportRecoveryErrorDeps, reportRecoveryError } from "./recovery-error-reporting.js";

export function firstPinCodeMailer(
  sender: FirstPinCodeEmailSender,
  deps: ReportRecoveryErrorDeps = {},
): FirstPinCodeMailer {
  return {
    async sendFirstPinCode(email, code) {
      try {
        await sender.sendFirstPinCode({ to: email, code });
      } catch (error) {
        reportRecoveryError("first PIN code: sending the email failed", error, deps);
        throw new FirstPinCodeEmailUnavailable();
      }
    },
  };
}
