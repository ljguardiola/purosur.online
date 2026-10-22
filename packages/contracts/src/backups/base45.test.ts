import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { base45Decode, base45Encode } from "./base45.js";

const text = (value: string) => new TextEncoder().encode(value);
const asText = (bytes: Uint8Array | null) =>
  bytes === null ? null : new TextDecoder().decode(bytes);

describe("base45Encode", () => {
  it.each([
    ["AB", "BB8"],
    ["Hello!!", "%69 VD92EX0"],
    ["base-45", "UJCLQE7W581"],
    ["ietf!", "QED8WEX0"],
    ["", ""],
  ])("encodes %j as %j", (plain, encoded) => {
    expect(base45Encode(text(plain))).toBe(encoded);
  });

  it("encodes the largest pair and the largest single byte", () => {
    expect(base45Encode(new Uint8Array([255, 255]))).toBe("FGW");
    expect(base45Encode(new Uint8Array([255]))).toBe("U5");
    expect(base45Encode(new Uint8Array([0]))).toBe("00");
  });
});

describe("base45Decode", () => {
  it.each([
    ["BB8", "AB"],
    ["%69 VD92EX0", "Hello!!"],
    ["UJCLQE7W581", "base-45"],
    ["QED8WEX0", "ietf!"],
    ["", ""],
  ])("decodes %j as %j", (encoded, plain) => {
    expect(asText(base45Decode(encoded))).toBe(plain);
  });

  it("decodes the largest pair and the largest single byte", () => {
    expect(base45Decode("FGW")).toEqual(new Uint8Array([255, 255]));
    expect(base45Decode("U5")).toEqual(new Uint8Array([255]));
  });

  it.each([
    ["a character outside the alphabet", "bb8"],
    ["a lowercase letter", "Bb8"],
    ["a length of one more than a multiple of three", "BB8B"],
    ["a trailing pair whose value is the first past the largest byte", "V5"],
    ["a group of three whose value does not fit in two bytes", "GGW"],
  ])("refuses %s", (_name, encoded) => {
    expect(base45Decode(encoded)).toBeNull();
  });

  it("accepts the largest value that fits in two bytes and refuses the next one", () => {
    expect(base45Decode("FGW")).not.toBeNull();
    expect(base45Decode("GGW")).toBeNull();
  });

  it("round-trips any bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (bytes) => {
        expect(base45Decode(base45Encode(bytes))).toEqual(bytes);
      }),
    );
  });

  it("encodes into the characters of the alphabet only", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 100 }), (bytes) => {
        expect(base45Encode(bytes)).toMatch(/^[0-9A-Z $%*+\-./:]*$/);
      }),
    );
  });
});
