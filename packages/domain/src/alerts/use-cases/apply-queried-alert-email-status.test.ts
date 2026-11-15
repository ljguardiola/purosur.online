import { describe, expect, it } from "vitest";
import { applyQueriedAlertEmailStatus } from "./apply-queried-alert-email-status.js";
import type { QueriedAlertEmailStatus } from "./alert-email-status-ports.js";
import {
  FakeAlertEmailStatusQuery,
  FakeAlertEmailStatusStore,
} from "./test-support/fake-alert-email-status.js";

function setup() {
  const store = new FakeAlertEmailStatusStore();
  const statusQuery = new FakeAlertEmailStatusQuery();
  store.seedSent("email-1", "delivery-1");
  const apply = (providerMessageId: string) =>
    applyQueriedAlertEmailStatus({ store, statusQuery }, { providerMessageId });
  return { store, statusQuery, apply };
}

describe("applyQueriedAlertEmailStatus", () => {
  it("acknowledges an email that is not a sent alert email without asking the provider about it", async () => {
    const { store, statusQuery, apply } = setup();

    await expect(apply("someone-elses-email")).resolves.toEqual({ kind: "not_an_alert_email" });

    expect(statusQuery.queried).toEqual([]);
    expect(store.undelivered).toEqual([]);
  });

  it("marks the delivery undelivered when the provider says it could not deliver it", async () => {
    const { store, statusQuery, apply } = setup();
    statusQuery.answer = { kind: "undelivered" };

    await expect(apply("email-1")).resolves.toEqual({
      kind: "marked_undelivered",
      deliveryId: "delivery-1",
    });

    expect(statusQuery.queried).toEqual(["email-1"]);
    expect(store.undelivered).toEqual(["delivery-1"]);
  });

  it.each([
    ["delivered", { kind: "delivered" }],
    ["in_transit", { kind: "in_transit" }],
  ] as [string, QueriedAlertEmailStatus][])(
    "names a %s answer and leaves the delivery as it is",
    async (kind, answer) => {
      const { store, statusQuery, apply } = setup();
      statusQuery.answer = answer;

      await expect(apply("email-1")).resolves.toEqual({ kind });

      expect(store.undelivered).toEqual([]);
    },
  );

  it("reports the provider unavailable and leaves the delivery as it is", async () => {
    const { store, statusQuery, apply } = setup();
    statusQuery.answer = { kind: "unavailable" };

    await expect(apply("email-1")).resolves.toEqual({ kind: "provider_unavailable" });

    expect(store.undelivered).toEqual([]);
  });
});
