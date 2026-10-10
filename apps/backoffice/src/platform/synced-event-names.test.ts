import { describe, expect, test } from "vitest";
import {
  ofSyncedAggregateType,
  syncedAggregateTypeName,
  syncedEventTypeName,
} from "./synced-event-names";

describe("the Spanish names of synced events", () => {
  test("names a known event type", () => {
    expect(syncedEventTypeName("cash_session_closed")).toBe("cierre de caja");
  });

  test("has no name for an unknown event type", () => {
    expect(syncedEventTypeName("something_new")).toBeUndefined();
  });

  test("names a known aggregate type with its preposition", () => {
    expect(ofSyncedAggregateType("CashSession")).toBe("de la sesión de caja");
  });

  test("has no name for an unknown aggregate type", () => {
    expect(ofSyncedAggregateType("Other")).toBeUndefined();
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
