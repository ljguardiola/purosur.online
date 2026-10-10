import { expect, test } from "vitest";
import {
  quarantinedDateTimeText,
  quarantinedEventColumnText,
  quarantinedEventSentenceText,
  quarantinedReasonText,
  quarantinedRegisterText,
} from "./quarantined-event-labels";
import { quarantinedCashClosing, quarantinedSale } from "./test-support/quarantined-events";

test("capitalizes the Spanish name of a known event type in the column", () => {
  expect(quarantinedEventColumnText("sale_cancelled")).toBe("Venta cancelada");
});

test("names an unknown event type in general words in the column, never by its code", () => {
  expect(quarantinedEventColumnText("something_new")).toBe("Desconocido");
});

test("names an event of a known type by its type inside a sentence", () => {
  expect(quarantinedEventSentenceText("cash_session_closed")).toBe("evento de cierre de caja");
});

test("names an event of an unknown type only as an event inside a sentence, never by its code", () => {
  expect(quarantinedEventSentenceText("something_new")).toBe("evento");
});

test("names the aggregate and shortens its id", () => {
  expect(quarantinedRegisterText(quarantinedSale)).toBe("Venta 0192bbbb…");
  expect(quarantinedRegisterText(quarantinedCashClosing)).toBe("Sesión de caja 0192cccc…");
});

test("names an unknown aggregate type in general words, never by its code", () => {
  expect(
    quarantinedRegisterText({ ...quarantinedSale, aggregateType: "Other", aggregateId: "abc" }),
  ).toBe("Registro abc");
});

test("writes a date and time in Argentina's time zone the way es-AR does", () => {
  expect(quarantinedDateTimeText("2026-10-07T02:30:00.000Z")).toMatch(/^06\/10\/2026,? 23:30$/);
});

test("capitalizes why an event was quarantined", () => {
  expect(quarantinedReasonText({ kind: "unreadable" })).toBe(
    "La nube no puede leer lo que envió la caja",
  );
});

test("shows a dash when the reason of the quarantine was not kept", () => {
  expect(quarantinedReasonText(null)).toBe("—");
});
