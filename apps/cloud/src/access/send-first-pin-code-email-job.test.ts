import { afterEach, describe, expect, it, vi } from "vitest";
import type { FirstPinCodeEmailSender } from "./recovery-email-sender.js";
import {
  type EmailedPinCode,
  type SendFirstPinCodeEmailJobDeps,
  sendFirstPinCodeEmailJob,
} from "./send-first-pin-code-email-job.js";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const PAYLOAD = {
  email: "grace@example.com",
  code: "K3PX7WNE2QRT6MZD",
};

const LIVE_CODE: EmailedPinCode = {
  expiresAt: new Date("2026-09-30T12:15:00.000Z"),
  redeemedAt: null,
  supersededAt: null,
  failedAttempts: 0,
};

function storedAs(code: EmailedPinCode | undefined) {
  return vi.fn<SendFirstPinCodeEmailJobDeps["findPinCode"]>().mockResolvedValue(code);
}

function reportedText(argument: unknown): string {
  return argument instanceof Error
    ? `${argument.message}\n${argument.stack ?? ""}`
    : typeof argument === "string"
      ? argument
      : JSON.stringify(argument);
}

function sender(): FirstPinCodeEmailSender & {
  sendFirstPinCode: ReturnType<typeof vi.fn<FirstPinCodeEmailSender["sendFirstPinCode"]>>;
} {
  return { sendFirstPinCode: vi.fn<FirstPinCodeEmailSender["sendFirstPinCode"]>() };
}

describe("sendFirstPinCodeEmailJob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emails the code to the address while the stored code is still live", async () => {
    const emailSender = sender();
    const findPinCode = storedAs(LIVE_CODE);

    await sendFirstPinCodeEmailJob(PAYLOAD, { emailSender, now: () => NOW, findPinCode });

    expect(findPinCode).toHaveBeenCalledExactlyOnceWith("K3PX7WNE2QRT6MZD");

    expect(emailSender.sendFirstPinCode).toHaveBeenCalledExactlyOnceWith({
      to: "grace@example.com",
      code: "K3PX7WNE2QRT6MZD",
    });
  });

  it("sends nothing for a code that has expired, and completes", async () => {
    const emailSender = sender();
    const atExpiry = new Date("2026-09-30T12:15:00.000Z");

    await expect(
      sendFirstPinCodeEmailJob(PAYLOAD, {
        emailSender,
        now: () => atExpiry,
        findPinCode: storedAs(LIVE_CODE),
      }),
    ).resolves.toBeUndefined();

    expect(emailSender.sendFirstPinCode).not.toHaveBeenCalled();
  });

  it.each([
    ["superseded by a newer code", { ...LIVE_CODE, supersededAt: NOW }],
    ["no longer stored", undefined],
  ])("sends nothing for a code %s, and completes", async (_state, stored) => {
    const emailSender = sender();

    await expect(
      sendFirstPinCodeEmailJob(PAYLOAD, {
        emailSender,
        now: () => NOW,
        findPinCode: storedAs(stored),
      }),
    ).resolves.toBeUndefined();

    expect(emailSender.sendFirstPinCode).not.toHaveBeenCalled();
  });

  it("rethrows a failed lookup without sending, so the job is retried", async () => {
    const emailSender = sender();
    const findPinCode = vi
      .fn<SendFirstPinCodeEmailJobDeps["findPinCode"]>()
      .mockRejectedValue(new Error("connection lost"));

    await expect(
      sendFirstPinCodeEmailJob(PAYLOAD, { emailSender, now: () => NOW, findPinCode }),
    ).rejects.toThrow("connection lost");

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
      { ...PAYLOAD, email: 1 },
      { ...PAYLOAD, code: 1 },
    ];

    for (const payload of malformed) {
      await expect(
        sendFirstPinCodeEmailJob(payload, {
          emailSender,
          now: () => NOW,
          findPinCode: storedAs(LIVE_CODE),
        }),
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
      sendFirstPinCodeEmailJob(PAYLOAD, {
        emailSender,
        now: () => NOW,
        findPinCode: storedAs(LIVE_CODE),
        captureException,
      }),
    ).rejects.toBe(error);

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(expect.any(String), error);
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
    const reported = [...consoleError.mock.calls, ...captureException.mock.calls]
      .flat()
      .map(reportedText);
    expect(reported).toContainEqual(expect.stringContaining("Resend API responded 500"));
    for (const text of reported) {
      expect(text).not.toContain("grace@example.com");
      expect(text).not.toContain("K3PX7WNE2QRT6MZD");
    }
  });

  it("reports nothing when the email goes out", async () => {
    const captureException = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await sendFirstPinCodeEmailJob(PAYLOAD, {
      emailSender: sender(),
      now: () => NOW,
      findPinCode: storedAs(LIVE_CODE),
      captureException,
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });
});
