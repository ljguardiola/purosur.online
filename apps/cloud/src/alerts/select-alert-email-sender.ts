import type { AlertEmailSender } from "@purosur/domain/alerts/use-cases";
import type { RecoveryEmailSenderEnv } from "../credentials/select-recovery-email-sender.js";
import { createLogAlertEmailSender } from "./log-alert-email-sender.js";
import { createResendAlertEmailSender } from "./resend-alert-email-sender.js";

export interface SelectAlertEmailSenderInput {
  emailSender: RecoveryEmailSenderEnv;
  emailFrom: string;
  emailReplyTo: string;
  backofficeOrigin: string;
}

export interface SelectAlertEmailSenderDeps {
  createResendAlertEmailSender?: typeof createResendAlertEmailSender;
  createLogAlertEmailSender?: typeof createLogAlertEmailSender;
}

export function selectAlertEmailSender(
  input: SelectAlertEmailSenderInput,
  deps: SelectAlertEmailSenderDeps = {},
): AlertEmailSender {
  const doCreateResendSender = deps.createResendAlertEmailSender ?? createResendAlertEmailSender;
  const doCreateLogSender = deps.createLogAlertEmailSender ?? createLogAlertEmailSender;

  if (input.emailSender.transport === "log") {
    return doCreateLogSender({ backofficeOrigin: input.backofficeOrigin });
  }
  return doCreateResendSender({
    apiKey: input.emailSender.resendApiKey,
    emailFrom: input.emailFrom,
    replyTo: input.emailReplyTo,
    backofficeOrigin: input.backofficeOrigin,
  });
}
