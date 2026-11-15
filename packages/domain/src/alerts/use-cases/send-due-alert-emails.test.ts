import { describe, expect, it } from "vitest";
import { ALERT_EMAIL_SEND_ATTEMPTS } from "../model/alert-email.js";
import { sendDueAlertEmails } from "./send-due-alert-emails.js";
import {
  FakeAlertEmailLanes,
  FakeAlertEmailSender,
} from "./test-support/fake-alert-email-delivery.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const MINUTE_MS = 60 * 1000;

function setup() {
  const lanes = new FakeAlertEmailLanes();
  const sender = new FakeAlertEmailSender(lanes);
  const store = lanes.store;
  const send = () =>
    sendDueAlertEmails({
      lanes,
      recipients: lanes.recipients,
      branches: lanes.branches,
      sender,
      clock: { now: () => new Date(NOW) },
    });
  return { lanes, sender, store, send };
}

describe("sendDueAlertEmails", () => {
  it("sends nothing and answers zero counts when no delivery is due", async () => {
    const { sender, send } = setup();

    await expect(send()).resolves.toEqual({
      kind: "ran",
      sent: 0,
      retrying: 0,
      failed: 0,
      skipped: 0,
    });

    expect(sender.sent).toEqual([]);
  });

  it("hands the sender the email of each due delivery, at its recipient's email and naming its branch's address", async () => {
    const { lanes, sender, store, send } = setup();
    lanes.recipients.recipients.set("user-ana", {
      email: "ana@example.test",
      active: true,
      alertEmailOptedIn: true,
    });
    lanes.branches.addresses.set("location-1", "Av. Siempreviva 742");
    store.seed({
      deliveryId: "delivery-1",
      recipientUserId: "user-ana",
      alertId: "alert-7",
      kind: "sales_denied",
      stage: "escalated",
      level: "critical",
      occurredAt: new Date("2026-10-01T11:30:00.000Z"),
      alertLocationId: "location-1",
    });

    await send();

    expect(sender.sent).toEqual([
      {
        deliveryId: "delivery-1",
        to: "ana@example.test",
        alertId: "alert-7",
        kind: "sales_denied",
        stage: "escalated",
        level: "critical",
        branchName: "Av. Siempreviva 742",
        occurredAt: new Date("2026-10-01T11:30:00.000Z"),
      },
    ]);
  });

  it("names no branch in the email of an alert that belongs to none, or whose branch has no address", async () => {
    const { lanes, sender, store, send } = setup();
    lanes.branches.addresses.set("location-blank", "");
    store.seed({ deliveryId: "delivery-1", alertLocationId: null });
    store.seed({ deliveryId: "delivery-2", alertLocationId: "location-blank" });

    await send();

    expect(sender.sent.map(({ branchName }) => branchName)).toEqual([null, null]);
    expect(lanes.log).toContain("alertEmailBranchAddress:location-blank");
    expect(lanes.log.filter((entry) => entry.startsWith("alertEmailBranchAddress"))).toHaveLength(
      1,
    );
  });

  it("does not send to a recipient who is no longer active, no longer has an opt-in or is gone, recording the delivery as skipped and counting it", async () => {
    const { lanes, sender, store, send } = setup();
    lanes.recipients.recipients.set("user-inactive", {
      email: "inactive@example.test",
      active: false,
      alertEmailOptedIn: true,
    });
    lanes.recipients.recipients.set("user-withdrawn", {
      email: "withdrawn@example.test",
      active: true,
      alertEmailOptedIn: false,
    });
    store.seed({ deliveryId: "inactive", recipientUserId: "user-inactive" });
    store.seed({ deliveryId: "withdrawn", recipientUserId: "user-withdrawn" });
    store.seed({ deliveryId: "gone" });
    lanes.recipients.recipients.delete("user-of-gone");
    store.seed({ deliveryId: "still-receives" });

    await expect(send()).resolves.toEqual({
      kind: "ran",
      sent: 1,
      retrying: 0,
      failed: 0,
      skipped: 3,
    });

    expect(sender.sent.map(({ deliveryId }) => deliveryId)).toEqual(["still-receives"]);
    for (const deliveryId of ["inactive", "withdrawn", "gone"]) {
      expect(store.find(deliveryId)).toMatchObject({ status: "skipped", attemptsMade: 0 });
      expect(lanes.log).not.toContain(`recordEmailAttempt:${deliveryId}`);
    }
    expect(lanes.log).toContain("recordEmailSkipped:inactive");
  });

  it("reads again, just before each send, whether its recipient still receives alert emails", async () => {
    const { lanes, sender, store, send } = setup();
    lanes.recipients.recipients.set("user-ana", {
      email: "ana@example.test",
      active: true,
      alertEmailOptedIn: true,
    });
    store.seed({ deliveryId: "first", recipientUserId: "user-ana" });
    store.seed({ deliveryId: "second", recipientUserId: "user-ana" });
    sender.onSend = () => {
      lanes.recipients.recipients.set("user-ana", {
        email: "ana@example.test",
        active: true,
        alertEmailOptedIn: false,
      });
    };

    await expect(send()).resolves.toEqual({
      kind: "ran",
      sent: 1,
      retrying: 0,
      failed: 0,
      skipped: 1,
    });

    expect(sender.sent.map(({ deliveryId }) => deliveryId)).toEqual(["first"]);
    expect(store.find("second")).toMatchObject({ status: "skipped", attemptsMade: 0 });
  });

  it("records a sent delivery with when it was sent and the provider's id, and counts it", async () => {
    const { store, send } = setup();
    store.seed({ deliveryId: "delivery-1" });

    await expect(send()).resolves.toEqual({
      kind: "ran",
      sent: 1,
      retrying: 0,
      failed: 0,
      skipped: 0,
    });

    expect(store.find("delivery-1")).toMatchObject({
      status: "sent",
      sentAt: NOW,
      providerMessageId: "provider-delivery-1",
      nextAttemptAt: null,
    });
  });

  it("reads the recipient, then records the attempt with when the next one is due, before it calls the sender, and what came of it after", async () => {
    const { lanes, store, send } = setup();
    store.seed({ deliveryId: "delivery-1", attemptsMade: 2 });

    await send();

    expect(lanes.log).toEqual([
      "pendingEmailDeliveries:held=true",
      "alertEmailRecipient:user-of-delivery-1",
      "recordEmailAttempt:delivery-1",
      "send:delivery-1:held=true",
      "recordEmailSent:delivery-1",
    ]);
  });

  it("numbers each attempt after the ones already made and waits twice as long before the next as after the previous one", async () => {
    const { store, send } = setup();
    store.seed({ deliveryId: "delivery-1", attemptsMade: 2 });
    store.seed({ deliveryId: "delivery-2", attemptsMade: 0 });

    await send();

    expect(store.attempts).toEqual([
      {
        deliveryId: "delivery-1",
        attempt: 3,
        nextAttemptAt: new Date(NOW.getTime() + 4 * MINUTE_MS),
      },
      { deliveryId: "delivery-2", attempt: 1, nextAttemptAt: new Date(NOW.getTime() + MINUTE_MS) },
    ]);
  });

  it("keeps a delivery whose send failed pending, with the reason it failed, to be retried, and counts it as retrying", async () => {
    const { sender, store, send } = setup();
    store.seed({ deliveryId: "delivery-1", attemptsMade: 1 });
    sender.results.set("delivery-1", { kind: "failed", reason: "provider_refused" });

    await expect(send()).resolves.toEqual({
      kind: "ran",
      sent: 0,
      retrying: 1,
      failed: 0,
      skipped: 0,
    });

    expect(store.find("delivery-1")).toMatchObject({
      status: "pending",
      error: "provider_refused",
      attemptsMade: 2,
      nextAttemptAt: new Date(NOW.getTime() + 2 * MINUTE_MS),
    });
  });

  it("gives up on a delivery whose last attempt fails, keeping the reason it failed, and counts it as failed", async () => {
    const { sender, store, send } = setup();
    store.seed({ deliveryId: "delivery-1", attemptsMade: ALERT_EMAIL_SEND_ATTEMPTS - 1 });
    sender.results.set("delivery-1", { kind: "failed", reason: "provider_unreachable" });

    await expect(send()).resolves.toEqual({
      kind: "ran",
      sent: 0,
      retrying: 0,
      failed: 1,
      skipped: 0,
    });

    expect(store.find("delivery-1")).toMatchObject({
      status: "failed",
      error: "provider_unreachable",
      attemptsMade: ALERT_EMAIL_SEND_ATTEMPTS,
    });
  });

  it("does not give up before the last attempt", async () => {
    const { sender, store, send } = setup();
    store.seed({ deliveryId: "delivery-1", attemptsMade: ALERT_EMAIL_SEND_ATTEMPTS - 2 });
    sender.results.set("delivery-1", { kind: "failed", reason: "provider_unreachable" });

    await expect(send()).resolves.toEqual({
      kind: "ran",
      sent: 0,
      retrying: 1,
      failed: 0,
      skipped: 0,
    });
  });

  it.each([ALERT_EMAIL_SEND_ATTEMPTS, ALERT_EMAIL_SEND_ATTEMPTS + 1])(
    "gives up, without sending again, on a pending delivery that already made %i attempts, keeping the reason it last failed",
    async (attemptsMade) => {
      const { lanes, sender, store, send } = setup();
      store.seed({ deliveryId: "delivery-1", attemptsMade, error: "provider_unreachable" });

      await expect(send()).resolves.toEqual({
        kind: "ran",
        sent: 0,
        retrying: 0,
        failed: 1,
        skipped: 0,
      });

      expect(sender.sent).toEqual([]);
      expect(lanes.log).not.toContain("recordEmailAttempt:delivery-1");
      expect(store.find("delivery-1")).toMatchObject({
        status: "failed",
        error: "provider_unreachable",
        attemptsMade,
        nextAttemptAt: null,
      });
    },
  );

  it("leaves alone a delivery whose next attempt is not due yet, and one already sent or failed", async () => {
    const { sender, store, send } = setup();
    store.seed({
      deliveryId: "waiting",
      attemptsMade: 1,
      nextAttemptAt: new Date(NOW.getTime() + 1),
    });
    store.seed({ deliveryId: "sent", status: "sent" });
    store.seed({ deliveryId: "failed", status: "failed" });
    store.seed({ deliveryId: "due-now", attemptsMade: 1, nextAttemptAt: NOW });

    await expect(send()).resolves.toEqual({
      kind: "ran",
      sent: 1,
      retrying: 0,
      failed: 0,
      skipped: 0,
    });

    expect(sender.sent.map(({ deliveryId }) => deliveryId)).toEqual(["due-now"]);
  });

  it("carries on with the other deliveries after one fails", async () => {
    const { sender, store, send } = setup();
    store.seed({ deliveryId: "delivery-1" });
    store.seed({ deliveryId: "delivery-2" });
    store.seed({ deliveryId: "delivery-3", attemptsMade: ALERT_EMAIL_SEND_ATTEMPTS - 1 });
    sender.results.set("delivery-1", { kind: "failed", reason: "provider_refused" });
    sender.results.set("delivery-3", { kind: "failed", reason: "provider_refused" });

    await expect(send()).resolves.toEqual({
      kind: "ran",
      sent: 1,
      retrying: 1,
      failed: 1,
      skipped: 0,
    });

    expect(sender.sent.map(({ deliveryId }) => deliveryId)).toEqual([
      "delivery-1",
      "delivery-2",
      "delivery-3",
    ]);
  });

  it("keeps the attempt it recorded when the sender throws, and stops the run", async () => {
    const { sender, store, send } = setup();
    store.seed({ deliveryId: "delivery-1" });
    store.seed({ deliveryId: "delivery-2" });
    sender.results.set("delivery-1", new Error("connection lost"));

    await expect(send()).rejects.toThrow("connection lost");

    expect(store.find("delivery-1")).toMatchObject({
      status: "pending",
      attemptsMade: 1,
      nextAttemptAt: new Date(NOW.getTime() + MINUTE_MS),
    });
    expect(store.find("delivery-2").attemptsMade).toBe(0);
  });

  it("holds the lane for the whole run and lets go of it afterwards", async () => {
    const { lanes, store, send } = setup();
    store.seed({ deliveryId: "delivery-1" });
    store.seed({ deliveryId: "delivery-2" });

    await send();

    expect(lanes.log.filter((entry) => entry.endsWith("held=true"))).toHaveLength(3);
    expect(lanes.held).toBe(false);
  });

  it("ends at once, reading and sending nothing, while another run holds the lane", async () => {
    const { lanes, sender, store, send } = setup();
    store.seed({ deliveryId: "delivery-1" });
    lanes.heldByAnotherRun = true;

    await expect(send()).resolves.toEqual({ kind: "lane_busy" });

    expect(sender.sent).toEqual([]);
    expect(lanes.log).toEqual(["inAlertEmailLane:busy"]);
    expect(store.find("delivery-1")).toMatchObject({ status: "pending", attemptsMade: 0 });
  });
});
