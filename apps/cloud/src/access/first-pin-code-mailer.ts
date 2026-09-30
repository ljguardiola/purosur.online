import {
  FirstPinCodeEmailUnavailable,
  type FirstPinCodeMailer,
} from "@purosur/domain/access/use-cases";
import type { FirstPinCodeEmailSender } from "./recovery-email-sender.js";

export function firstPinCodeMailer(sender: FirstPinCodeEmailSender): FirstPinCodeMailer {
  return {
    async sendFirstPinCode(email, code) {
      try {
        await sender.sendFirstPinCode({ to: email, code });
      } catch {
        throw new FirstPinCodeEmailUnavailable();
      }
    },
  };
}
