import { expect, test } from "vitest";
import { type RegisterModalContextSource, registerModalContext } from "./register-modal-context";

const register1: RegisterModalContextSource = { name: "Caja 1", installation: null };
const enrolledRegister: RegisterModalContextSource = {
  name: "Caja 3",
  installation: { hostname: "CAJA-MOSTRADOR" },
};

test("names the register and its machine", () => {
  expect(registerModalContext(enrolledRegister)).toBe("Caja 3 · CAJA-MOSTRADOR");
});

test("names only the register when it has no installation", () => {
  expect(registerModalContext(register1)).toBe("Caja 1");
});

test("has no name without a register", () => {
  expect(registerModalContext(null)).toBe("");
});
