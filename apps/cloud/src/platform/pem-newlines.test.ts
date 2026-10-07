import { describe, expect, it } from "vitest";
import { normalizePemNewlines } from "./pem-newlines.js";

describe("normalizePemNewlines", () => {
  it("turns the literal two-character \\n into a line break", () => {
    expect(normalizePemNewlines("-----BEGIN X-----\\nabc\\n-----END X-----")).toBe(
      "-----BEGIN X-----\nabc\n-----END X-----",
    );
  });

  it("leaves a PEM that already has line breaks as it is", () => {
    expect(normalizePemNewlines("-----BEGIN X-----\nabc\n-----END X-----")).toBe(
      "-----BEGIN X-----\nabc\n-----END X-----",
    );
  });
});
