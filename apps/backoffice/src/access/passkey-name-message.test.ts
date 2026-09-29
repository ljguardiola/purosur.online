import { expect, test } from "vitest";
import { passkeyNameMessage } from "./passkey-name-message";

test("rejects a passkey name over 40 characters once trimmed", () => {
  expect(passkeyNameMessage({ name: ` ${"a".repeat(41)} ` })).toBe(
    "El nombre no puede superar los 40 caracteres.",
  );
});
