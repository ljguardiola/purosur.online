import { FirstPinCodeEmailUnavailable } from "@purosur/domain/access/use-cases";
import { afterEach, describe, expect, it, vi } from "vitest";
import { firstPinCodeMailer } from "./first-pin-code-mailer.js";
import type { FirstPinCodeEmailSender } from "./recovery-email-sender.js";

describe("firstPinCodeMailer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emails the code to the address", async () => {
    const sendFirstPinCode = vi
      .fn<FirstPinCodeEmailSender["sendFirstPinCode"]>()
      .mockResolvedValue();

    await firstPinCodeMailer({ sendFirstPinCode }).sendFirstPinCode("grace@example.com", "CODE");

    expect(sendFirstPinCode).toHaveBeenCalledExactlyOnceWith({
      to: "grace@example.com",
      code: "CODE",
    });
  });

  it("turns a failed send into the email being unavailable", async () => {
    const sendFirstPinCode = vi
      .fn<FirstPinCodeEmailSender["sendFirstPinCode"]>()
      .mockRejectedValue(new Error("Resend API responded 500"));

    await expect(
      firstPinCodeMailer({ sendFirstPinCode }).sendFirstPinCode("grace@example.com", "CODE"),
    ).rejects.toBeInstanceOf(FirstPinCodeEmailUnavailable);
  });

  it("reports a failed send to the console and Sentry, without the address or the code", async () => {
    const error = new Error("Resend API responded 500");
    const sendFirstPinCode = vi
      .fn<FirstPinCodeEmailSender["sendFirstPinCode"]>()
      .mockRejectedValue(error);
    const captureException = vi.fn().mockReturnValue("event-id");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      firstPinCodeMailer({ sendFirstPinCode }, { captureException }).sendFirstPinCode(
        "grace@example.com",
        "CODE",
      ),
    ).rejects.toBeInstanceOf(FirstPinCodeEmailUnavailable);

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(expect.any(String), error);
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
    const reported = JSON.stringify([consoleError.mock.calls, captureException.mock.calls]);
    expect(reported).not.toContain("grace@example.com");
    expect(reported).not.toContain("CODE");
  });

  it("reports nothing when the email goes out", async () => {
    const sendFirstPinCode = vi
      .fn<FirstPinCodeEmailSender["sendFirstPinCode"]>()
      .mockResolvedValue();
    const captureException = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await firstPinCodeMailer({ sendFirstPinCode }, { captureException }).sendFirstPinCode(
      "grace@example.com",
      "CODE",
    );

    expect(consoleError).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });
});
