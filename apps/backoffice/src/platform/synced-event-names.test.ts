import { describe, expect, test } from "vitest";
import {
  ofSyncedAggregate,
  syncedAggregateTypeName,
  syncedEventTypeName,
} from "./synced-event-names";

describe("the Spanish names of synced events", () => {
  test("names a known event type", () => {
    expect(syncedEventTypeName("cash_session_closed")).toBe("cierre de caja");
  });

  test("names a voided sale apart from a cancelled one", () => {
    expect(syncedEventTypeName("sale_voided")).toBe("venta anulada");
    expect(syncedEventTypeName("sale_cancelled")).toBe("venta cancelada");
  });

  test("names the replacement of a QR payment", () => {
    expect(syncedEventTypeName("qr_payment_replaced")).toBe("reemplazo de pago QR");
  });

  test("names the recording and the withdrawal of an initial inventory line", () => {
    expect(syncedEventTypeName("opening_count_recorded")).toBe("línea del inventario inicial");
    expect(syncedEventTypeName("opening_count_withdrawn")).toBe(
      "línea del inventario inicial quitada",
    );
  });

  test("names a factura issued under a pre-obtained code", () => {
    expect(syncedEventTypeName("offline_fiscal_document_issued")).toBe("factura emitida con CAEA");
  });

  test("names the correction of a register's clock", () => {
    expect(syncedEventTypeName("clock_corrected")).toBe("corrección de reloj");
  });

  test("names the recording of a deferred sale", () => {
    expect(syncedEventTypeName("deferred_sale_recorded")).toBe("venta diferida registrada");
  });

  test("has no name for an unknown event type", () => {
    expect(syncedEventTypeName("something_new")).toBeUndefined();
  });

  test("names an aggregate of a known type with its preposition and its id", () => {
    expect(ofSyncedAggregate({ aggregateType: "CashSession", aggregateId: "session-1" })).toBe(
      "de la sesión de caja session-1",
    );
  });

  test("names an aggregate of an unknown type in general words and its id", () => {
    expect(ofSyncedAggregate({ aggregateType: "Other", aggregateId: "other-1" })).toBe(
      "del registro other-1",
    );
  });
});

describe("the Spanish names of synced aggregates", () => {
  test("names a known aggregate type", () => {
    expect(syncedAggregateTypeName("Sale")).toBe("Venta");
    expect(syncedAggregateTypeName("CashSession")).toBe("Sesión de caja");
  });

  test("has no name for an unknown aggregate type", () => {
    expect(syncedAggregateTypeName("Other")).toBeUndefined();
  });
});
