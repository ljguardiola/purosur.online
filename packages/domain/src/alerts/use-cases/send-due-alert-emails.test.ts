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
  const send = () => sendDueAlertEmails({ lanes, sender, clock: { now: () => new Date(NOW) } });
  return { lanes, sender, store, send };
}

describe("sendDueAlertEmails", () => {
  it("sends nothing and answers zero counts when no delivery is due", async () => {
    const { sender, send } = setup();

    await expect(send()).resolves.toEqual({ sent: 0, retrying: 0, failed: 0 });

    expect(sender.sent).toEqual([]);
  });

  it("hands the sender the email of each due delivery", async () => {
    const { sender, store, send } = setup();
    store.seed({
      deliveryId: "delivery-1",
      to: "ana@example.test",
      alertId: "alert-7",
      kind: "sales_denied",
      stage: "escalated",
      level: "critical",
      occurredAt: new Date("2026-10-01T11:30:00.000Z"),
      alertBranchName: "Sucursal Centro",
      recipientBranchName: "Casa Central",
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
        branchName: "Sucursal Centro",
        occurredAt: new Date("2026-10-01T11:30:00.000Z"),
      },
    ]);
  });

  it("names the recipient's branch in the email of an alert that belongs to no branch", async () => {
    const { sender, store, send } = setup();
    store.seed({
      deliveryId: "delivery-1",
      alertBranchName: null,
      recipientBranchName: "Casa Central",
    });

    await send();

    expect(sender.sent[0]?.branchName).toBe("Casa Central");
  });

  it("records a sent delivery with when it was sent and the provider's id, and counts it", async () => {
    const { store, send } = setup();
    store.seed({ deliveryId: "delivery-1" });

    await expect(send()).resolves.toEqual({ sent: 1, retrying: 0, failed: 0 });

    expect(store.find("delivery-1")).toMatchObject({
      status: "sent",
      sentAt: NOW,
      providerMessageId: "provider-delivery-1",
      nextAttemptAt: null,
    });
  });

  it("records the attempt, with when the next one is due, before it calls the sender, and what came of it after", async () => {
    const { lanes, store, send } = setup();
    store.seed({ deliveryId: "delivery-1", attemptsMade: 2 });

    await send();

    expect(lanes.log).toEqual([
      "pendingEmailDeliveries:held=true",
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

  it("keeps a delivery whose send failed pending, with its error, to be retried, and counts it as retrying", async () => {
    const { sender, store, send } = setup();
    store.seed({ deliveryId: "delivery-1", attemptsMade: 1 });
    sender.results.set("delivery-1", { kind: "failed", error: "mailbox full" });

    await expect(send()).resolves.toEqual({ sent: 0, retrying: 1, failed: 0 });

    expect(store.find("delivery-1")).toMatchObject({
      status: "pending",
      error: "mailbox full",
      attemptsMade: 2,
      nextAttemptAt: new Date(NOW.getTime() + 2 * MINUTE_MS),
    });
  });

  it("gives up on a delivery whose last attempt fails, keeping its error, and counts it as failed", async () => {
    const { sender, store, send } = setup();
    store.seed({ deliveryId: "delivery-1", attemptsMade: ALERT_EMAIL_SEND_ATTEMPTS - 1 });
    sender.results.set("delivery-1", { kind: "failed", error: "mailbox full" });

    await expect(send()).resolves.toEqual({ sent: 0, retrying: 0, failed: 1 });

    expect(store.find("delivery-1")).toMatchObject({
      status: "failed",
      error: "mailbox full",
      attemptsMade: ALERT_EMAIL_SEND_ATTEMPTS,
    });
  });

  it("does not give up before the last attempt", async () => {
    const { sender, store, send } = setup();
    store.seed({ deliveryId: "delivery-1", attemptsMade: ALERT_EMAIL_SEND_ATTEMPTS - 2 });
    sender.results.set("delivery-1", { kind: "failed", error: "timeout" });

    await expect(send()).resolves.toEqual({ sent: 0, retrying: 1, failed: 0 });
  });

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

    await expect(send()).resolves.toEqual({ sent: 1, retrying: 0, failed: 0 });

    expect(sender.sent.map(({ deliveryId }) => deliveryId)).toEqual(["due-now"]);
  });

  it("carries on with the other deliveries after one fails", async () => {
    const { sender, store, send } = setup();
    store.seed({ deliveryId: "delivery-1" });
    store.seed({ deliveryId: "delivery-2" });
    store.seed({ deliveryId: "delivery-3", attemptsMade: ALERT_EMAIL_SEND_ATTEMPTS - 1 });
    sender.results.set("delivery-1", { kind: "failed", error: "boom" });
    sender.results.set("delivery-3", { kind: "failed", error: "boom" });

    await expect(send()).resolves.toEqual({ sent: 1, retrying: 1, failed: 1 });

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
});
