import { describe, expect, it } from "vitest";
import {
  isSupplierContactTooLong,
  isSupplierNameTooLong,
  isSupplierNoteTooLong,
  SUPPLIER_CONTACT_MAX_LENGTH,
  SUPPLIER_NAME_MAX_LENGTH,
  SUPPLIER_NOTE_MAX_LENGTH,
} from "./supplier.js";

describe("supplier text limits", () => {
  it("allows a name of up to 100 characters and a contact and a note of up to 200", () => {
    expect(SUPPLIER_NAME_MAX_LENGTH).toBe(100);
    expect(SUPPLIER_CONTACT_MAX_LENGTH).toBe(200);
    expect(SUPPLIER_NOTE_MAX_LENGTH).toBe(200);
  });

  it.each([
    ["name", isSupplierNameTooLong, SUPPLIER_NAME_MAX_LENGTH],
    ["contact", isSupplierContactTooLong, SUPPLIER_CONTACT_MAX_LENGTH],
    ["note", isSupplierNoteTooLong, SUPPLIER_NOTE_MAX_LENGTH],
  ])("accepts a %s of exactly its limit and rejects one character more", (_field, isTooLong, limit) => {
    expect(isTooLong("a".repeat(limit))).toBe(false);
    expect(isTooLong("a".repeat(limit + 1))).toBe(true);
  });

  it.each([
    ["name", isSupplierNameTooLong, SUPPLIER_NAME_MAX_LENGTH],
    ["contact", isSupplierContactTooLong, SUPPLIER_CONTACT_MAX_LENGTH],
    ["note", isSupplierNoteTooLong, SUPPLIER_NOTE_MAX_LENGTH],
  ])("counts each emoji of a %s as one character", (_field, isTooLong, limit) => {
    expect(isTooLong("🌱".repeat(limit))).toBe(false);
    expect(isTooLong("🌱".repeat(limit + 1))).toBe(true);
  });
});
