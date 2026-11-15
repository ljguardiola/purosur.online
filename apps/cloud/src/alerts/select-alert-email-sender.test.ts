import { describe, expect, it, vi } from "vitest";
import {
  FICTIONAL_RECOVERY_REPLY_TO,
  FICTIONAL_RECOVERY_SENDER,
} from "../test-support/recovery-email.js";
import { selectAlertEmailSender } from "./select-alert-email-sender.js";

const ORIGIN = "https://staging.purosur.online";

describe("selectAlertEmailSender", () => {
  it("builds the Resend sender, with the recovery emails' sender and reply-to, when the transport is resend", () => {
    const fakeSender = { sendAlertEmail: vi.fn() };
    const createResendAlertEmailSender = vi.fn().mockReturnValue(fakeSender);
    const createLogAlertEmailSender = vi.fn();

    const sender = selectAlertEmailSender(
      {
        emailSender: { transport: "resend", resendApiKey: "re_test_key" },
        emailFrom: FICTIONAL_RECOVERY_SENDER,
        emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
        backofficeOrigin: ORIGIN,
      },
      { createResendAlertEmailSender, createLogAlertEmailSender },
    );

    expect(createResendAlertEmailSender).toHaveBeenCalledWith({
      apiKey: "re_test_key",
      emailFrom: FICTIONAL_RECOVERY_SENDER,
      replyTo: FICTIONAL_RECOVERY_REPLY_TO,
      backofficeOrigin: ORIGIN,
    });
    expect(createLogAlertEmailSender).not.toHaveBeenCalled();
    expect(sender).toBe(fakeSender);
  });

  it("builds the logging sender, and never touches Resend, when the transport is log", () => {
    const fakeSender = { sendAlertEmail: vi.fn() };
    const createResendAlertEmailSender = vi.fn();
    const createLogAlertEmailSender = vi.fn().mockReturnValue(fakeSender);

    const sender = selectAlertEmailSender(
      {
        emailSender: { transport: "log" },
        emailFrom: FICTIONAL_RECOVERY_SENDER,
        emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
        backofficeOrigin: "http://localhost:5173",
      },
      { createResendAlertEmailSender, createLogAlertEmailSender },
    );

    expect(createLogAlertEmailSender).toHaveBeenCalledWith({
      backofficeOrigin: "http://localhost:5173",
    });
    expect(createResendAlertEmailSender).not.toHaveBeenCalled();
    expect(sender).toBe(fakeSender);
  });
});
