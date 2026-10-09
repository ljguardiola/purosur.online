import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isAcceptablePin, PIN_MIN_DIGITS } from "./pin.js";

const digit = fc.constantFrom(..."0123456789");

describe("isAcceptablePin", () => {
  it("accepts every run of at least the minimum number of digits", () => {
    fc.assert(
      fc.property(fc.string({ unit: digit, minLength: PIN_MIN_DIGITS, maxLength: 40 }), (pin) =>
        isAcceptablePin(pin),
      ),
    );
  });

  it("rejects every run of digits shorter than the minimum", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: digit, maxLength: PIN_MIN_DIGITS - 1 }),
        (pin) => !isAcceptablePin(pin),
      ),
    );
  });

  it("rejects every text that holds a character other than an ASCII digit", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: digit, minLength: PIN_MIN_DIGITS, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 3 }).filter((text) => /[^0-9]/.test(text)),
        fc.nat(20),
        (pin, intruder, position) => {
          const at = position % (pin.length + 1);
          return !isAcceptablePin(pin.slice(0, at) + intruder + pin.slice(at));
        },
      ),
    );
  });

  it.each([
    ["six digits", "123456", true],
    ["five digits", "12345", false],
    ["empty", "", false],
    ["a trailing line break", "123456\n", false],
    ["Arabic-Indic digits", "١٢٣٤٥٦", false],
    ["full-width digits", "１２３４５６", false],
    ["spaces between digits", "123 456", false],
  ])("for %s answers %s", (_case, pin, accepted) => {
    expect(isAcceptablePin(pin)).toBe(accepted);
  });

  it("requires six digits", () => {
    expect(PIN_MIN_DIGITS).toBe(6);
  });
});
