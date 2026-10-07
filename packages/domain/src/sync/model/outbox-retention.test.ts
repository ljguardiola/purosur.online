import { describe, expect, it } from "vitest";
import { OUTBOX_RETENTION_AFTER_ACK_MS, outboxPruneCutoff } from "./outbox-retention.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("how long the register keeps an acknowledged outbox event", () => {
  it("keeps it for 30 days after its acknowledgement", () => {
    expect(OUTBOX_RETENTION_AFTER_ACK_MS).toBe(30 * DAY_MS);
  });

  it("forgets only what was acknowledged before 30 days ago", () => {
    const now = new Date("2026-10-31T12:00:00.000Z");

    expect(outboxPruneCutoff(now)).toEqual(new Date("2026-10-01T12:00:00.000Z"));
  });

  it("does not move the instant it was given", () => {
    const now = new Date("2026-10-31T12:00:00.000Z");
    outboxPruneCutoff(now);

    expect(now).toEqual(new Date("2026-10-31T12:00:00.000Z"));
  });
});
