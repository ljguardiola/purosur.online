import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { newestPrice, priceInEffectAt } from "./current-price.js";

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
});

describe("priceInEffectAt", () => {
  const moment = new Date("2026-09-30T12:00:00.000Z");

  it("is the newest of the prices already started, ignoring one that starts later", () => {
    const started = { id: "a", validFrom: LATER };
    const future = { id: "b", validFrom: new Date("2026-10-15T00:00:00.000Z") };

    expect(priceInEffectAt([{ id: "c", validFrom: EARLIER }, started, future], moment)).toBe(
      started,
    );
  });

  it("starts applying at the very millisecond it becomes valid", () => {
    const starting = { id: "a", validFrom: moment };
    const oneMillisecondLater = { id: "b", validFrom: new Date(moment.getTime() + 1) };

    expect(priceInEffectAt([starting, oneMillisecondLater], moment)).toBe(starting);
  });

  it("is missing while every price starts later", () => {
    expect(
      priceInEffectAt([{ id: "a", validFrom: new Date(moment.getTime() + 1) }], moment),
    ).toBeUndefined();
  });
});
