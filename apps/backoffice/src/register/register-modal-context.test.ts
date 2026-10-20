import { expect, test } from "vitest";
import { registerModalContext } from "./register-modal-context";
import type { RegisterSummary } from "./registers-api";

const register1: RegisterSummary = {
  id: "register-1",
  name: "Caja 1",
  pendingCode: null,
  pointOfSaleNumber: null,
  pointTerminalId: null,
  pointTerminalVersion: 0,
  qrExternalPosId: null,
  qrPointOfSaleVersion: 0,
  installation: null,
};
const enrolledRegister: RegisterSummary = {
  ...register1,
  id: "register-3",
  name: "Caja 3",
  installation: {
    state: "enrolled",
    hostname: "CAJA-MOSTRADOR",
    windowsVersion: "Windows 11",
    enrolledAt: "2026-08-02T01:30:00.000Z",
    bitlockerKeyLoaded: false,
  },
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
