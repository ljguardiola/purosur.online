import type { RegisterPaymentsTarget } from "../../platform/register-payments-target";

export const register1: RegisterPaymentsTarget = {
  id: "register-1",
  name: "Caja 1",
  pointTerminalId: null,
  pointTerminalVersion: 0,
  qrExternalPosId: null,
  qrPointOfSaleVersion: 0,
};

export const register2: RegisterPaymentsTarget = {
  id: "register-2",
  name: "Caja 2",
  pointTerminalId: "TERM-0042",
  pointTerminalVersion: 2,
  qrExternalPosId: "CAJA2_STORE_POS",
  qrPointOfSaleVersion: 4,
};
