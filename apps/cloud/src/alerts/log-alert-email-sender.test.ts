import type { AlertEmail } from "@purosur/domain/alerts/use-cases";
import { afterEach, describe, expect, it, vi } from "vitest";
import { alertEmailContent } from "./alert-email-content.js";
import { createLogAlertEmailSender } from "./log-alert-email-sender.js";

const ORIGIN = "http://localhost:5173";

const EMAIL: AlertEmail = {
  deliveryId: "delivery-1",
  to: "ada@example.com",
  alertId: "alert-1",
  kind: "register_silent",
  stage: "opened",
  level: "warning",
  branchName: "Puro Sur",
  occurredAt: new Date("2026-10-01T15:30:00.000Z"),
};

describe("createLogAlertEmailSender", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the recipient, the subject and the link to the process log instead of sending mail", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await createLogAlertEmailSender({ backofficeOrigin: ORIGIN }).sendAlertEmail(EMAIL);

    expect(log).toHaveBeenCalledTimes(1);
    const [line] = log.mock.calls[0] as [string];
    expect(line).toContain("ada@example.com");
    expect(line).toContain(alertEmailContent(EMAIL, ORIGIN).subject);
    expect(line).toContain("http://localhost:5173/?alert=alert-1");
  });

  it("answers sent, naming the delivery as the message", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await createLogAlertEmailSender({ backofficeOrigin: ORIGIN }).sendAlertEmail(
      EMAIL,
    );

    expect(result).toEqual({ kind: "sent", providerMessageId: "log:delivery-1" });
  });
});
