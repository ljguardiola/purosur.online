import { describe, expect, test } from "vitest";
import { ofSyncedAggregateType, syncedEventTypeName } from "./synced-event-names";

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
