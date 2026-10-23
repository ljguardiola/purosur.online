import { describe, expect, it } from "vitest";
import { backupTickets } from "../shell/test-support/contingency-backup-tickets";
import { contingencyBackupTicketsNoticeCount } from "./contingency-backup-tickets-notice-count";

describe("contingencyBackupTicketsNoticeCount", () => {
  it("counts no notice when nothing needs attention", () => {
    expect(contingencyBackupTicketsNoticeCount(backupTickets({ kept: 2 }))).toBe(0);
  });

  it.each([
    [{ to_print: 1 }, 1],
    [{ awaiting_customer_document: 4 }, 1],
    [{ missing_key: 2 }, 1],
    [{ discardable: 2, may_discard: true }, 1],
    [{ to_print: 1, awaiting_customer_document: 1, missing_key: 1 }, 2],
    [{ to_print: 1, missing_key: 1, discardable: 1, may_discard: true }, 3],
  ])("counts one notice per kind that applies for %j", (tickets, count) => {
    expect(contingencyBackupTicketsNoticeCount(backupTickets(tickets))).toBe(count);
  });
});
