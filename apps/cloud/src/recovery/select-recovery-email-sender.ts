import { createLogRecoveryEmailSender } from "./log-email-sender.js";
import type { RecoveryEmailSender } from "./recovery-email-sender.js";
import { createResendRecoveryEmailSender } from "./resend-email-sender.js";

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
