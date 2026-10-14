import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { newestPrice } from "./current-price.js";

const EARLIER = new Date("2026-09-01T00:00:00.000Z");
const LATER = new Date("2026-09-15T00:00:00.000Z");

describe("newestPrice", () => {
  it("is missing when there is no price", () => {
    expect(newestPrice([])).toBeUndefined();
  });

  it("is the one that starts last, wherever it sits among the others", () => {
    const older = { id: "b", validFrom: EARLIER };
    const newer = { id: "a", validFrom: LATER };

    expect(newestPrice([older, newer])).toBe(newer);
    expect(newestPrice([newer, older])).toBe(newer);
  });

  it("is the one with the greater id when two start at the same moment", () => {
    const lesser = { id: "00000000-0000-4000-8000-000000000001", validFrom: LATER };
    const greater = { id: "00000000-0000-4000-8000-000000000002", validFrom: LATER };

    expect(newestPrice([lesser, greater])).toBe(greater);
    expect(newestPrice([greater, lesser])).toBe(greater);
  });

  it("keeps the first copy when the same price is offered twice", () => {
    const first = { id: "a", validFrom: LATER };
    const second = { id: "a", validFrom: LATER };

    expect(newestPrice([first, second])).toBe(first);
  });

  it("is the same price whatever order the candidates arrive in", () => {
    const candidate = fc.record({
      id: fc.constantFrom("a", "b", "c", "d"),
      validFrom: fc.constantFrom(EARLIER, LATER),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(candidate, { minLength: 1, selector: (price) => price.id }),
        (candidates) => {
          expect(newestPrice([...candidates].reverse())).toBe(newestPrice(candidates));
        },
      ),
    );
  });

  it("is the same price over the whole history as over only the prices that start last", () => {
    const candidate = fc.record({
      id: fc.constantFrom("a", "b", "c", "d", "e"),
      validFrom: fc.constantFrom(EARLIER, LATER, new Date("2026-10-01T00:00:00.000Z")),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(candidate, { minLength: 1, selector: (price) => price.id }),
        (history) => {
          const newestStart = Math.max(...history.map(({ validFrom }) => validFrom.getTime()));
          const startingLast = history.filter(
            ({ validFrom }) => validFrom.getTime() === newestStart,
          );

          expect(newestPrice(startingLast)).toBe(newestPrice(history));
        },
      ),
    );
  });
});
