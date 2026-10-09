import { describe, expect, it, vi } from "vitest";
import { selectRecoveryEmailSender } from "./select-recovery-email-sender.js";

describe("selectRecoveryEmailSender", () => {
  it("builds the Resend sender, with the configured from/reply-to, when the transport is resend", () => {
    const fakeSender = { sendRecoveryLink: vi.fn() };
    const createResendRecoveryEmailSender = vi.fn().mockReturnValue(fakeSender);
    const createLogRecoveryEmailSender = vi.fn();

    const sender = selectRecoveryEmailSender(
      {
        emailSender: { transport: "resend", resendApiKey: "re_test_key" },
        emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
        emailReplyTo: "purosur.comarca@gmail.com",
      },
      { createResendRecoveryEmailSender, createLogRecoveryEmailSender },
    );

    expect(createResendRecoveryEmailSender).toHaveBeenCalledWith({
      apiKey: "re_test_key",
      from: "Puro Sur <acceso@mail.staging.purosur.online>",
      replyTo: "purosur.comarca@gmail.com",
    });
    expect(createLogRecoveryEmailSender).not.toHaveBeenCalled();
    expect(sender).toBe(fakeSender);
  });

  it("builds the logging sender, and never touches Resend, when the transport is log", () => {
    const fakeSender = { sendRecoveryLink: vi.fn() };
    const createResendRecoveryEmailSender = vi.fn();
    const createLogRecoveryEmailSender = vi.fn().mockReturnValue(fakeSender);

    const sender = selectRecoveryEmailSender(
      {
        emailSender: { transport: "log" },
        emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
        emailReplyTo: "purosur.comarca@gmail.com",
      },
      { createResendRecoveryEmailSender, createLogRecoveryEmailSender },
    );

    expect(createLogRecoveryEmailSender).toHaveBeenCalledWith();
    expect(createResendRecoveryEmailSender).not.toHaveBeenCalled();
    expect(sender).toBe(fakeSender);
  });
});
