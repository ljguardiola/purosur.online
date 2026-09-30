import { afterEach, describe, expect, it, vi } from "vitest";
import type { FirstPinCodeEmailSender } from "./recovery-email-sender.js";
import { sendFirstPinCodeEmailJob } from "./send-first-pin-code-email-job.js";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const PAYLOAD = {
  email: "grace@example.com",
  code: "K3PX7WNE2QRT6MZD",
  expiresAt: "2026-09-30T12:15:00.000Z",
};

function sender(): FirstPinCodeEmailSender & {
  sendFirstPinCode: ReturnType<typeof vi.fn<FirstPinCodeEmailSender["sendFirstPinCode"]>>;
} {
  return { sendFirstPinCode: vi.fn<FirstPinCodeEmailSender["sendFirstPinCode"]>() };
}

describe("sendFirstPinCodeEmailJob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emails the code to the address", async () => {
    const emailSender = sender();

    await sendFirstPinCodeEmailJob(PAYLOAD, { emailSender, now: () => NOW });

    expect(emailSender.sendFirstPinCode).toHaveBeenCalledExactlyOnceWith({
      to: "grace@example.com",
      code: "K3PX7WNE2QRT6MZD",
    });
  });

  it("still sends a code that has a moment left", async () => {
    const emailSender = sender();
    const justBefore = new Date("2026-09-30T12:14:59.999Z");

    await sendFirstPinCodeEmailJob(PAYLOAD, { emailSender, now: () => justBefore });

    expect(emailSender.sendFirstPinCode).toHaveBeenCalledTimes(1);
  });

  it("sends nothing for a code that has expired, and completes", async () => {
    const emailSender = sender();
    const atExpiry = new Date("2026-09-30T12:15:00.000Z");

    await expect(
      sendFirstPinCodeEmailJob(PAYLOAD, { emailSender, now: () => atExpiry }),
    ).resolves.toBeUndefined();

    expect(emailSender.sendFirstPinCode).not.toHaveBeenCalled();
  });

  it("rejects a malformed payload without sending", async () => {
    const emailSender = sender();
    const malformed: unknown[] = [
      null,
      "payload",
      {},
      { ...PAYLOAD, email: undefined },
      { ...PAYLOAD, code: undefined },
      { ...PAYLOAD, expiresAt: undefined },
      { ...PAYLOAD, email: 1 },
      { ...PAYLOAD, code: 1 },
      { ...PAYLOAD, expiresAt: "not-a-date" },
    ];

    for (const payload of malformed) {
      await expect(
        sendFirstPinCodeEmailJob(payload, { emailSender, now: () => NOW }),
      ).rejects.toThrow("malformed job payload");
    }

    expect(emailSender.sendFirstPinCode).not.toHaveBeenCalled();
  });

  it("rethrows a failed send so the job is retried, reporting it without the address or the code", async () => {
    const error = new Error("Resend API responded 500");
    const emailSender = sender();
    emailSender.sendFirstPinCode.mockRejectedValue(error);
    const captureException = vi.fn().mockReturnValue("event-id");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      sendFirstPinCodeEmailJob(PAYLOAD, { emailSender, now: () => NOW, captureException }),
    ).rejects.toBe(error);

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(expect.any(String), error);
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
    const reported = JSON.stringify([consoleError.mock.calls, captureException.mock.calls]);
    expect(reported).not.toContain("grace@example.com");
    expect(reported).not.toContain("K3PX7WNE2QRT6MZD");
  });

  it("reports nothing when the email goes out", async () => {
    const captureException = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await sendFirstPinCodeEmailJob(PAYLOAD, {
      emailSender: sender(),
      now: () => NOW,
      captureException,
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });
});
