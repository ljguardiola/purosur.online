import { expect, test } from "vitest";
import { pinCodeValidity } from "./pin-code-validity";

test("names the validity in minutes", () => {
  expect(pinCodeValidity()).toBe("15 minutos");
});
