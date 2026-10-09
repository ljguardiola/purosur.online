import { describe, expect, it } from "vitest";
import {
  PAYMENT_NOTIFICATION_LIMIT,
  PAYMENT_NOTIFICATION_WINDOW_MS,
} from "../model/mercado-pago-notifications.js";
import { admitPaymentNotification } from "./admit-payment-notification.js";
import { FakePaymentNotificationAdmission } from "./test-support/fake-payment-notification-admission.js";

const ORIGIN = "203.0.113.7";
const OTHER_ORIGIN = "203.0.113.8";
const NOW = new Date("2026-10-09T12:00:00.000Z");

function secondsAgo(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * 1000);
}

function admitting(admission: FakePaymentNotificationAdmission, sourceAddress = ORIGIN) {
  return admitPaymentNotification({ admission, clock: { now: () => NOW } }, { sourceAddress });
}

function fill(
  admission: FakePaymentNotificationAdmission,
  count: number,
  at = secondsAgo(1),
  sourceAddress = ORIGIN,
) {
  for (let index = 0; index < count; index += 1) {
    admission.admitted.push({ sourceAddress, at });
  }
}

describe("admitPaymentNotification", () => {
  it("admits a notification below the limit and records it", async () => {
    const admission = new FakePaymentNotificationAdmission();

    expect(await admitting(admission)).toEqual({ kind: "admitted" });
    expect(admission.admittedAt(ORIGIN)).toEqual([NOW]);
  });

  it("locks the origin's attempts before reading them", async () => {
    const admission = new FakePaymentNotificationAdmission();

    await admitting(admission);

    expect(admission.calls[0]).toBe(`lockNotificationAttempts ${ORIGIN}`);
    expect(admission.calls.indexOf(`admittedNotifications ${ORIGIN}`)).toBeGreaterThan(0);
  });

  it("admits the last notification below the limit", async () => {
    const admission = new FakePaymentNotificationAdmission();
    fill(admission, PAYMENT_NOTIFICATION_LIMIT - 1);

    expect(await admitting(admission)).toEqual({ kind: "admitted" });
  });

  it("refuses a notification at the limit, telling when the oldest counted one leaves the window, and records nothing", async () => {
    const admission = new FakePaymentNotificationAdmission();
    fill(admission, PAYMENT_NOTIFICATION_LIMIT - 1);
    fill(admission, 1, secondsAgo(40));

    expect(await admitting(admission)).toEqual({ kind: "rate_limited", retryAfterSeconds: 20 });
    expect(admission.admittedAt(ORIGIN)).toHaveLength(PAYMENT_NOTIFICATION_LIMIT);
    expect(admission.calls.filter((call) => call.startsWith("recordAdmitted"))).toEqual([]);
    expect(admission.calls.filter((call) => call.startsWith("forgetNotifications"))).toEqual([]);
  });

  it("counts each origin on its own", async () => {
    const admission = new FakePaymentNotificationAdmission();
    fill(admission, PAYMENT_NOTIFICATION_LIMIT, secondsAgo(1), OTHER_ORIGIN);

    expect(await admitting(admission)).toEqual({ kind: "admitted" });
  });

  it("forgets the origin's notifications that left the window once it admits one", async () => {
    const admission = new FakePaymentNotificationAdmission();
    const leftTheWindow = new Date(NOW.getTime() - PAYMENT_NOTIFICATION_WINDOW_MS);
    fill(admission, 2, leftTheWindow);
    fill(admission, 1, secondsAgo(30));
    fill(admission, 1, secondsAgo(90), OTHER_ORIGIN);

    await admitting(admission);

    expect(admission.admittedAt(ORIGIN)).toEqual([secondsAgo(30), NOW]);
    expect(admission.admittedAt(OTHER_ORIGIN)).toEqual([secondsAgo(90)]);
  });

  it("leaves nothing behind when recording fails", async () => {
    const admission = new FakePaymentNotificationAdmission();
    admission.failRecording = true;
    fill(admission, 1, secondsAgo(90));

    await expect(admitting(admission)).rejects.toThrow("the notification could not be recorded");

    expect(admission.admittedAt(ORIGIN)).toEqual([secondsAgo(90)]);
  });
});
