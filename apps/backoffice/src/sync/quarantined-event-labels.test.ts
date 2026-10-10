import { expect, test } from "vitest";
import {
  quarantinedDateTimeText,
  quarantinedEventColumnText,
  quarantinedEventSentenceText,
  quarantinedRegisterText,
} from "./quarantined-event-labels";
import { quarantinedCashClosing, quarantinedSale } from "./test-support/quarantined-events";

test("capitalizes the Spanish name of a known event type in the column", () => {
  expect(quarantinedEventColumnText("sale_cancelled")).toBe("Venta cancelada");
});

test("shows the raw type of an unknown event type", () => {
  expect(quarantinedEventColumnText("something_new")).toBe("something_new");
  expect(quarantinedEventSentenceText("something_new")).toBe("something_new");
});

test("names a known event type in lowercase inside a sentence", () => {
  expect(quarantinedEventSentenceText("cash_session_closed")).toBe("cierre de caja");
});

test("names the aggregate and shortens its id", () => {
  expect(quarantinedRegisterText(quarantinedSale)).toBe("Venta 0192bbbb…");
  expect(quarantinedRegisterText(quarantinedCashClosing)).toBe("Sesión de caja 0192cccc…");
});

test("falls back to the raw aggregate type when it is unknown", () => {
  expect(
    quarantinedRegisterText({ ...quarantinedSale, aggregateType: "Other", aggregateId: "abc" }),
  ).toBe("Other abc");
});

test("writes a date and time in Argentina's time zone the way es-AR does", () => {
  expect(quarantinedDateTimeText("2026-10-07T02:30:00.000Z")).toMatch(/^06\/10\/2026,? 23:30$/);
});
