import { describe, expect, it } from "vitest";
import { ReportedNotifications } from "./reported-notifications.js";

describe("ReportedNotifications", () => {
  it("tells a notification is reported only the first time", () => {
    const reported = new ReportedNotifications(3);

    expect([
      reported.firstReport("a"),
      reported.firstReport("a"),
      reported.firstReport("b"),
    ]).toEqual([true, false, true]);
  });

  it("forgets the oldest notification once it holds as many as it may, and only that one", () => {
    const reported = new ReportedNotifications(2);
    reported.firstReport("a");
    reported.firstReport("b");
    reported.firstReport("c");

    expect([
      reported.firstReport("c"),
      reported.firstReport("b"),
      reported.firstReport("a"),
    ]).toEqual([false, false, true]);
  });

  it("does not count a notification reported again as a newer one", () => {
    const reported = new ReportedNotifications(2);
    reported.firstReport("a");
    reported.firstReport("b");
    reported.firstReport("a");
    reported.firstReport("c");

    expect(reported.firstReport("a")).toBe(true);
  });
});
