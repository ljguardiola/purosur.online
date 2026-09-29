import { describe, expect, it } from "vitest";
import { passkeyListSchema, passkeySummarySchema } from "./passkey-summary.js";

const notebook = {
  id: "passkey-1",
  name: "Notebook",
  created_at: "2026-03-01T12:00:00.000Z",
  last_used_at: "2026-03-02T09:30:00.000Z",
};
const neverUsed = { ...notebook, id: "passkey-2", name: "Teléfono", last_used_at: null };

describe("passkeySummarySchema", () => {
  it("accepts a passkey used before and one never used", () => {
    expect(passkeySummarySchema.safeParse(notebook).data).toEqual(notebook);
    expect(passkeySummarySchema.safeParse(neverUsed).data).toEqual(neverUsed);
  });

  it("strips keys it does not define", () => {
    expect(passkeySummarySchema.safeParse({ ...notebook, user_id: "user-1" }).data).toEqual(
      notebook,
    );
  });

  it.each(["id", "name", "created_at", "last_used_at"])("requires %s", (field) => {
    const { [field as keyof typeof notebook]: _omitted, ...rest } = notebook;

    expect(passkeySummarySchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["id", 1],
    ["id", null],
    ["name", 1],
    ["name", null],
    ["created_at", 1],
    ["created_at", null],
    ["last_used_at", 1],
    ["last_used_at", undefined],
  ])("refuses %s as %j", (field, value) => {
    expect(passkeySummarySchema.safeParse({ ...notebook, [field]: value }).success).toBe(false);
  });
});

describe("passkeyListSchema", () => {
  it("accepts a list of passkeys, empty or not", () => {
    expect(passkeyListSchema.safeParse([]).data).toEqual([]);
    expect(passkeyListSchema.safeParse([notebook, neverUsed]).data).toEqual([notebook, neverUsed]);
  });

  it.each([undefined, null, {}, "passkeys", notebook])("refuses %j as a list", (body) => {
    expect(passkeyListSchema.safeParse(body).success).toBe(false);
  });

  it("refuses a list holding a malformed passkey", () => {
    expect(passkeyListSchema.safeParse([notebook, { ...neverUsed, name: 2 }]).success).toBe(false);
  });
});
