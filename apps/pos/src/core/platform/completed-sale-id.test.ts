import { describe, expect, it } from "vitest";
import { completedSaleId } from "./completed-sale-id";

describe("completedSaleId", () => {
  it("is the id of the sale a charge completed", () => {
    const completed = { kind: "completed", sale_id: "sale-1" };

    expect(completedSaleId(completed)).toBe("sale-1");
  });

  it("is the id of the sale completed by a payment the customer had already made", () => {
    const alreadyPaid = {
      kind: "already_paid",
      settlement: { kind: "completed", sale_id: "sale-1", total: 476_000 },
    };

    expect(completedSaleId(alreadyPaid)).toBe("sale-1");
  });

  it.each([
    { kind: "already_paid", settlement: { kind: "partially_paid", sale_id: "sale-1" } },
    { kind: "already_paid", settlement: { kind: "completed", sale_id: 7 } },
    { kind: "already_paid", settlement: "completed" },
    { kind: "already_paid" },
    { kind: "partially_paid", sale_id: "sale-1" },
    { kind: "completed" },
    { kind: "completed", sale_id: 7 },
  ])("is none for the outcome %j", (outcome) => {
    expect(completedSaleId(outcome)).toBeUndefined();
  });
});
