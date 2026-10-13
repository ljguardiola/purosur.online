import { describe, expect, it } from "vitest";
import { recipeSaveRefusalSchema } from "./recipe-save-refusal.js";

const message = "refused";

describe("recipeSaveRefusalSchema", () => {
  it.each([
    { code: "product_not_found", message },
    { code: "stale_version", message },
    { code: "component_not_found", message, componentProductId: "p-2" },
    { code: "invalid_recipe", message, reason: { kind: "no_components" } },
    { code: "invalid_recipe", message, reason: { kind: "self_component" } },
    {
      code: "invalid_recipe",
      message,
      reason: { kind: "repeated_component", componentProductId: "p-2" },
    },
    {
      code: "invalid_recipe",
      message,
      reason: { kind: "invalid_quantity", componentProductId: "p-2" },
    },
  ])("accepts the refusal $code as the cloud sends it", (refusal) => {
    expect(recipeSaveRefusalSchema.safeParse(refusal).data).toEqual(refusal);
  });

  it.each([
    [{ code: "component_not_found", message }],
    [{ code: "invalid_recipe", message }],
    [{ code: "invalid_recipe", message, reason: { kind: "repeated_component" } }],
    [{ code: "invalid_recipe", message, reason: { kind: "invalid_quantity" } }],
    [{ code: "invalid_recipe", message, reason: { kind: "unknown" } }],
    [{ code: "saved", message }],
    [{ code: "stale_version" }],
  ])("rejects the body %j", (body) => {
    expect(recipeSaveRefusalSchema.safeParse(body).success).toBe(false);
  });

  it("strips keys it does not define", () => {
    expect(
      recipeSaveRefusalSchema.safeParse({ code: "stale_version", message, extra: 1 }).data,
    ).toEqual({ code: "stale_version", message });
  });
});
