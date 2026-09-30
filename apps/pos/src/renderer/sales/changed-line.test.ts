import type { OpenSale } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { changedLineId } from "./changed-line";

function line(id: string, quantity: number) {
  return {
    id,
    product_id: `product-${id}`,
    product_name: id,
    quantity,
    list_unit_price: 100,
    line_total: 100 * quantity,
  };
}

function sale(...lines: ReturnType<typeof line>[]): OpenSale {
  return { id: "sale-1", lines, total: lines.reduce((sum, item) => sum + item.line_total, 0) };
}

describe("changedLineId", () => {
  it("is the first line of a sale that had none", () => {
    expect(changedLineId(null, sale(line("a", 1)))).toBe("a");
  });

  it("is the line that was added", () => {
    expect(changedLineId(sale(line("a", 1)), sale(line("a", 1), line("b", 1)))).toBe("b");
  });

  it("is the line whose quantity went up", () => {
    expect(changedLineId(sale(line("a", 1), line("b", 1)), sale(line("a", 2), line("b", 1)))).toBe(
      "a",
    );
  });

  it("is nothing when no line differs", () => {
    expect(changedLineId(sale(line("a", 1)), sale(line("a", 1)))).toBeUndefined();
  });

  it("is nothing for a sale without lines", () => {
    expect(changedLineId(null, sale())).toBeUndefined();
  });
});
