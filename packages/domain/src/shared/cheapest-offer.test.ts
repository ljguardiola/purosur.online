import { describe, expect, it } from "vitest";
import { cheapestOffer } from "./cheapest-offer.js";

describe("cheapestOffer", () => {
  const offer = (name: string, numerator: bigint, denominator: bigint) => ({
    name,
    pricePerSaleUnit: { numerator, denominator },
  });

  it("answers nothing without offers", () => {
    expect(cheapestOffer([])).toBeUndefined();
  });

  it("answers the offer with the lowest price per sale unit", () => {
    const offers = [offer("a", 1n, 2n), offer("b", 1n, 3n), offer("c", 3n, 4n)];

    expect(cheapestOffer(offers)?.name).toBe("b");
  });

  it("keeps the earliest offer among equally cheap ones", () => {
    const offers = [offer("a", 2n, 4n), offer("b", 1n, 2n), offer("c", 1n, 2n)];

    expect(cheapestOffer(offers)?.name).toBe("a");
  });
});
