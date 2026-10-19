import { expect, test } from "vitest";
import { registerModalContext } from "./register-modal-context";
import { enrolledRegister, register1 } from "./test-support/registers-list-screen";

test("names the register and its machine", () => {
  expect(registerModalContext(enrolledRegister)).toBe("Caja 3 · CAJA-MOSTRADOR");
});

test("names only the register when it has no installation", () => {
  expect(registerModalContext(register1)).toBe("Caja 1");
});

test("has no name without a register", () => {
  expect(registerModalContext(null)).toBe("");
});
