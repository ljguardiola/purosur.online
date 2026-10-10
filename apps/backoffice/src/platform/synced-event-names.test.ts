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
