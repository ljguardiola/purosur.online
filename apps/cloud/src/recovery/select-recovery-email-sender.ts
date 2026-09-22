import { createLogRecoveryEmailSender } from "./log-email-sender.js";
import type { RecoveryEmailSender } from "./recovery-email-sender.js";
import { createResendRecoveryEmailSender } from "./resend-email-sender.js";

/**
 * `resend` sends a real email through the Resend API; `log` writes the recovery link to the
 * process log instead, for local development only (see `resolveRecoveryEmailSenderEnv` in
 * server.ts, the only place that resolves this from the environment).
 */
export type RecoveryEmailSenderEnv =
  | { transport: "resend"; resendApiKey: string }
  | { transport: "log" };

export interface SelectRecoveryEmailSenderInput {
  emailSender: RecoveryEmailSenderEnv;
  emailFrom: string;
  emailReplyTo: string;
}

export interface SelectRecoveryEmailSenderDeps {
  createResendRecoveryEmailSender?: typeof createResendRecoveryEmailSender;
  createLogRecoveryEmailSender?: typeof createLogRecoveryEmailSender;
}

/**
 * The only place that turns a resolved `RecoveryEmailSenderEnv` (server.ts's
 * `resolveRecoveryEmailSenderEnv`) into an actual `RecoveryEmailSender`, so the two real
 * implementations are never chosen anywhere else.
 */
export function selectRecoveryEmailSender(
  input: SelectRecoveryEmailSenderInput,
  deps: SelectRecoveryEmailSenderDeps = {},
): RecoveryEmailSender {
  const doCreateResendSender =
    deps.createResendRecoveryEmailSender ?? createResendRecoveryEmailSender;
  const doCreateLogSender = deps.createLogRecoveryEmailSender ?? createLogRecoveryEmailSender;

  if (input.emailSender.transport === "log") {
    return doCreateLogSender();
  }
  return doCreateResendSender({
    apiKey: input.emailSender.resendApiKey,
    from: input.emailFrom,
    replyTo: input.emailReplyTo,
  });
}
