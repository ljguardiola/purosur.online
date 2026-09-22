import type { RecoveryEmailSender } from "./recovery-email-sender.js";

/**
 * Writes the recovery link to the process log instead of sending mail. Selected only by
 * `resolveRecoveryEmailSenderEnv` (server.ts) on an explicit `RECOVERY_EMAIL_TRANSPORT=log`, so a
 * developer can register the first passkey locally without a real mail provider.
 */
export function createLogRecoveryEmailSender(): RecoveryEmailSender {
  return {
    async sendRecoveryLink(input) {
      console.log(`recovery link for ${input.to}: ${input.link}`);
    },
  };
}
