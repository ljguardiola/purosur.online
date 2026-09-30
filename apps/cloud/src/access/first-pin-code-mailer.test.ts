import { FirstPinCodeEmailUnavailable } from "@purosur/domain/access/use-cases";
import { describe, expect, it, vi } from "vitest";
import { firstPinCodeMailer } from "./first-pin-code-mailer.js";
import type { FirstPinCodeEmailSender } from "./recovery-email-sender.js";

describe("firstPinCodeMailer", () => {
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
});
