import type { JsonValue } from "@purosur/domain";

export function shapeOf(value: JsonValue): JsonValue {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return value.map(shapeOf);
  }
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shapeOf(item)]));
  }
  return typeof value;
}
