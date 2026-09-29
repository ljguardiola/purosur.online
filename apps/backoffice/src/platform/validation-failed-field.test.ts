import { expect, test } from "vitest";
import { readValidationFailedField } from "./validation-failed-field";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 400 });
}

test("reads the wire field a validation_failed response names", async () => {
  const response = jsonResponse({
    code: "validation_failed",
    message: "name must not be empty",
    details: [{ field: "name" }],
  });

  expect(await readValidationFailedField(response)).toBe("name");
});

test.each([
  ["another code", { code: "conflict", details: [{ field: "name" }] }],
  ["no details", { code: "validation_failed" }],
  ["empty details", { code: "validation_failed", details: [] }],
  ["a detail without a field", { code: "validation_failed", details: [{}] }],
  ["a numeric field", { code: "validation_failed", details: [{ field: 1 }] }],
  ["an empty field", { code: "validation_failed", details: [{ field: "" }] }],
  ["a body that is not an object", "validation_failed"],
])("reads no field from a response with %s", async (_name, body) => {
  expect(await readValidationFailedField(jsonResponse(body))).toBeUndefined();
});

test("reads no field from a body that is not JSON", async () => {
  expect(await readValidationFailedField(new Response("nope", { status: 400 }))).toBeUndefined();
});
