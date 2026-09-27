import type { RecoveryEmailSender } from "./recovery-email-sender.js";

export function createLogRecoveryEmailSender(): RecoveryEmailSender {
  return {
    async sendRecoveryLink(input) {
      console.log(`recovery link for ${input.to}: ${input.link}`);
    },
  };
}
