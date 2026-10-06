import { describe, expect, it } from "vitest";
import { shapeOf } from "./event-shape.js";

describe("the shape of a value", () => {
  it("replaces every leaf by its JSON kind", () => {
    expect(shapeOf({ a: null, b: true, c: 3, d: "x" })).toEqual({
      a: "null",
      b: "boolean",
      c: "number",
      d: "string",
    });
  });

  it("keeps the keys of nested objects and the order of an array's elements", () => {
    expect(shapeOf({ items: [{ id: "x", qty: 1 }, "y", 2], meta: { tags: [] } })).toEqual({
      items: [{ id: "string", qty: "number" }, "string", "number"],
      meta: { tags: [] },
    });
  });

  it("tells values of the same kind apart from values of another kind", () => {
    expect(shapeOf({ a: 1 })).toEqual(shapeOf({ a: 2 }));
    expect(shapeOf({ a: 1 })).not.toEqual(shapeOf({ a: "1" }));
    expect(shapeOf({ a: 1 })).not.toEqual(shapeOf({ a: 1, b: 1 }));
  });
});
