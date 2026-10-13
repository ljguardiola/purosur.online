import { describe, expect, it } from "vitest";
import { readInitialCount } from "./read-initial-count.js";
import {
  FakeInitialCountLedger,
  type FakeInitialCountState,
} from "./test-support/fake-initial-count-ledger.js";

const COUNTER = { isAdministrator: false, permissionKeys: ["record_initial_inventory"] };
const YERBA = { id: "yerba", name: "Yerba 1 kg", saleUnit: "UNIT" as const };
const QUESO = { id: "queso", name: "Queso cremoso", saleUnit: "KG" as const };

function counted(
  id: string,
  productId: string,
  delta: number,
  at: string,
  expiresOn: string | null,
) {
  return {
    id,
    productId,
    kind: "opening_count" as const,
    delta,
    occurredAt: new Date(at),
    expiresOn,
    withdrawsMovementId: null,
  };
}

function ledger(state: Partial<FakeInitialCountState> = {}): FakeInitialCountLedger {
  return new FakeInitialCountLedger({
    accesses: { counter: COUNTER },
    products: [YERBA, QUESO],
    ...state,
  });
}

describe("readInitialCount", () => {
  it("is offered, with no lines, before anything is counted", () => {
    expect(readInitialCount({ ledger: ledger() }, { actorId: "counter" })).toEqual({
      kind: "read",
      offered: true,
      lines: [],
    });
  });

  it("lists the lines with their product's name and sale unit, in the order they were confirmed", () => {
    const store = ledger({
      movements: [
        counted("m-late", "queso", 1_250, "2026-10-07T10:00:00.000Z", null),
        counted("m-early", "yerba", 6_000, "2026-10-07T09:00:00.000Z", "2027-01-31"),
      ],
    });

    const outcome = readInitialCount({ ledger: store }, { actorId: "counter" });

    expect(outcome).toEqual({
      kind: "read",
      offered: true,
      lines: [
        {
          movementId: "m-early",
          productId: "yerba",
          productName: "Yerba 1 kg",
          saleUnit: "UNIT",
          counted: 6_000,
          expiresOn: "2027-01-31",
        },
        {
          movementId: "m-late",
          productId: "queso",
          productName: "Queso cremoso",
          saleUnit: "KG",
          counted: 1_250,
          expiresOn: null,
        },
      ],
    });
  });

  it("lists lines confirmed at the same moment by their movement id, whatever order they came in", () => {
    const store = ledger({
      movements: [
        counted("m-b", "yerba", 6_000, "2026-10-07T09:00:00.000Z", null),
        counted("m-c", "queso", 1_250, "2026-10-07T09:00:00.000Z", null),
        counted("m-a", "yerba", 2_000, "2026-10-07T09:00:00.000Z", "2027-01-31"),
      ],
    });

    const outcome = readInitialCount({ ledger: store }, { actorId: "counter" });

    expect(outcome).toMatchObject({
      lines: [{ movementId: "m-a" }, { movementId: "m-b" }, { movementId: "m-c" }],
    });
  });

  it("orders movement ids confirmed at the same moment alphabetically, whatever their case", () => {
    const store = ledger({
      movements: [
        counted("m-B", "yerba", 6_000, "2026-10-07T09:00:00.000Z", null),
        counted("m-a", "queso", 1_250, "2026-10-07T09:00:00.000Z", null),
      ],
    });

    const outcome = readInitialCount({ ledger: store }, { actorId: "counter" });

    expect(outcome).toMatchObject({ lines: [{ movementId: "m-a" }, { movementId: "m-B" }] });
  });

  it("leaves out a line that was withdrawn", () => {
    const store = ledger({
      movements: [
        counted("m-1", "yerba", 6_000, "2026-10-07T09:00:00.000Z", null),
        counted("m-2", "queso", 1_250, "2026-10-07T09:10:00.000Z", null),
        {
          id: "m-3",
          productId: "yerba",
          kind: "opening_count_withdrawal",
          delta: -6_000,
          occurredAt: new Date("2026-10-07T09:20:00.000Z"),
          expiresOn: null,
          withdrawsMovementId: "m-1",
        },
      ],
    });

    const outcome = readInitialCount({ ledger: store }, { actorId: "counter" });

    expect(outcome).toMatchObject({ lines: [{ movementId: "m-2" }] });
  });

  it.each([
    ["the branch's first cash session has opened", { branchFirstSessionOpened: true }],
    ["this register has opened a cash session", { ownSessionEverOpened: true }],
  ])("is no longer offered once %s", (_case, state) => {
    expect(readInitialCount({ ledger: ledger(state) }, { actorId: "counter" })).toMatchObject({
      kind: "read",
      offered: false,
    });
  });

  it("refuses a person who may not record the initial inventory before reading anything else", () => {
    const store = ledger({ accesses: {} });

    expect(readInitialCount({ ledger: store }, { actorId: "counter" })).toEqual({
      kind: "not_permitted",
    });
    expect(store.lookups).toEqual(["actorAccess"]);
  });
});
