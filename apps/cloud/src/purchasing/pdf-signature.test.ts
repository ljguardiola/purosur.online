import { describe, expect, it } from "vitest";
import { hasPdfSignature } from "./pdf-signature.js";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("hasPdfSignature", () => {
  it("accepts bytes that start with %PDF-", () => {
    expect(hasPdfSignature(bytes("%PDF-1.7\n%âãÏÓ"))).toBe(true);
  });

  it("refuses bytes that do not start with it", () => {
    expect(hasPdfSignature(bytes("<html></html>"))).toBe(false);
    expect(hasPdfSignature(bytes(" %PDF-1.7"))).toBe(false);
    expect(hasPdfSignature(bytes("%PDF"))).toBe(false);
  });

  it("refuses empty bytes", () => {
    expect(hasPdfSignature(new Uint8Array())).toBe(false);
  });
});
