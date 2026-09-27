import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogRecoveryEmailSender } from "./log-email-sender.js";

describe("createLogRecoveryEmailSender", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the recipient and the link to the process log instead of sending mail", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const sender = createLogRecoveryEmailSender();

    await sender.sendRecoveryLink({
      to: "ada@example.com",
      link: "http://localhost:5173/account-recovery/passkey#abc123",
    });

    expect(log).toHaveBeenCalledTimes(1);
    const [line] = log.mock.calls[0] as [string];
    expect(line).toContain("ada@example.com");
    expect(line).toContain("http://localhost:5173/account-recovery/passkey#abc123");
  });
});
