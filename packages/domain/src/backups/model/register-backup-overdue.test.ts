import { describe, expect, it } from "vitest";
import {
  isRegisterBackupOverdue,
  REGISTER_BACKUP_OVERDUE_AFTER_MS,
} from "./register-backup-overdue.js";

const NOW = new Date("2026-10-14T15:00:00.000Z");

function changedAgo(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

describe("REGISTER_BACKUP_OVERDUE_AFTER_MS", () => {
  it("is one hour", () => {
    expect(REGISTER_BACKUP_OVERDUE_AFTER_MS).toBe(60 * 60 * 1000);
  });
});

describe("isRegisterBackupOverdue", () => {
  it("is overdue when the first change since the last verified generation is more than an hour old", () => {
    expect(
      isRegisterBackupOverdue({
        firstChangeSinceLastVerifiedAt: changedAgo(REGISTER_BACKUP_OVERDUE_AFTER_MS + 1),
        now: NOW,
      }),
    ).toBe(true);
  });

  it("is not overdue when the first change is exactly an hour old", () => {
    expect(
      isRegisterBackupOverdue({
        firstChangeSinceLastVerifiedAt: changedAgo(REGISTER_BACKUP_OVERDUE_AFTER_MS),
        now: NOW,
      }),
    ).toBe(false);
  });

  it("is not overdue when the first change is less than an hour old", () => {
    expect(
      isRegisterBackupOverdue({
        firstChangeSinceLastVerifiedAt: changedAgo(REGISTER_BACKUP_OVERDUE_AFTER_MS - 1),
        now: NOW,
      }),
    ).toBe(false);
  });

  it("is never overdue when the register recorded no changes", () => {
    expect(isRegisterBackupOverdue({ firstChangeSinceLastVerifiedAt: null, now: NOW })).toBe(false);
  });
});
