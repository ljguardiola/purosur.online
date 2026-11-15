import { describe, expect, it } from "vitest";
import { applyQueriedAlertEmailStatus } from "./apply-queried-alert-email-status.js";
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
  it("acknowledges an email the provider holds as no alert email's and no delivery sent", async () => {
    const { store, statusQuery, apply } = setup();
    statusQuery.answer = { kind: "answered", status: "bounced", alertDeliveryId: null };

    await expect(apply("someone-elses-email")).resolves.toEqual({ kind: "not_an_alert_email" });

    expect(statusQuery.queried).toEqual(["someone-elses-email"]);
    expect(store.undelivered).toEqual([]);
  });

  it("asks to be told again later about an alert email whose sending is not yet recorded", async () => {
    const { store, statusQuery, apply } = setup();
    store.seedPending("delivery-2");
    statusQuery.answer = { kind: "answered", status: "bounced", alertDeliveryId: "delivery-2" };

    await expect(apply("email-2")).resolves.toEqual({ kind: "send_not_yet_recorded" });

    expect(store.undelivered).toEqual([]);
  });

  it("acknowledges an alert email whose delivery is no longer sent with that email", async () => {
    const { store, statusQuery, apply } = setup();
    statusQuery.answer = { kind: "answered", status: "bounced", alertDeliveryId: "delivery-2" };

    await expect(apply("email-2")).resolves.toEqual({ kind: "not_a_sent_alert_email" });

    expect(store.undelivered).toEqual([]);
  });

  it.each([
    ["the provider holds it as the delivery's", "delivery-1"],
    ["the provider holds it as no delivery's", null],
  ])(
    "marks the sent delivery undelivered when the provider says it could not deliver it and %s",
    async (_case, alertDeliveryId) => {
      const { store, statusQuery, apply } = setup();
      statusQuery.answer = { kind: "answered", status: "bounced", alertDeliveryId };

      await expect(apply("email-1")).resolves.toEqual({
        kind: "marked_undelivered",
        deliveryId: "delivery-1",
      });

      expect(statusQuery.queried).toEqual(["email-1"]);
      expect(store.undelivered).toEqual(["delivery-1"]);
    },
  );

  it.each([
    ["opened", "delivered"],
    ["delivery_delayed", "unchanged"],
    ["a_future_status", "unchanged"],
  ])(
    "names the provider's %s answer as %s and leaves the delivery as it is",
    async (status, kind) => {
      const { store, statusQuery, apply } = setup();
      statusQuery.answer = { kind: "answered", status, alertDeliveryId: "delivery-1" };

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
