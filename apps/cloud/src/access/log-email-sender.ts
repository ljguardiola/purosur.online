import type { AccessEmailSender } from "./recovery-email-sender.js";

export function createLogRecoveryEmailSender(): AccessEmailSender {
  return {
    async sendRecoveryLink(input) {
      console.log(`recovery link for ${input.to}: ${input.link}`);
    },
    async sendFirstPinCode(input) {
      console.log(`first PIN code for ${input.to}: ${input.code}`);
    },
  };
}
