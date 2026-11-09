import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { averageTicket } from "./average-ticket.js";

describe("averageTicket", () => {
  it("divides the total sold by the number of sales", () => {
    expect(averageTicket({ total: 12_000, salesCount: 3 })).toBe(4_000);
  });

  it("rounds to the nearest cent", () => {
    expect(averageTicket({ total: 10_000, salesCount: 3 })).toBe(3_333);
    expect(averageTicket({ total: 20_000, salesCount: 3 })).toBe(6_667);
  });

  it("rounds half a cent up", () => {
    expect(averageTicket({ total: 5, salesCount: 2 })).toBe(3);
    expect(averageTicket({ total: 1, salesCount: 2 })).toBe(1);
  });

  it("is no average when there are no sales", () => {
    expect(averageTicket({ total: 0, salesCount: 0 })).toBeNull();
  });

  it("is zero for sales that added up to nothing", () => {
    expect(averageTicket({ total: 0, salesCount: 4 })).toBe(0);
  });

  it("stays within half a cent of the exact quotient", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        (total, salesCount) => {
          const average = averageTicket({ total, salesCount });

          expect(average).not.toBeNull();
          expect(Math.abs((average ?? 0) * salesCount - total)).toBeLessThanOrEqual(salesCount / 2);
        },
      ),
    );
  });
});
