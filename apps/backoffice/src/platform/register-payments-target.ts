import type { CloudReadOutcome } from "./cloud-read-outcome";

export type RegisterPaymentsTarget = {
  id: string;
  name: string;
  pointTerminalId: string | null;
  pointTerminalVersion: number;
  qrExternalPosId: string | null;
  qrPointOfSaleVersion: number;
};

export type RegisterPaymentsReload =
  | { kind: "found"; register: RegisterPaymentsTarget }
  | { kind: "not_found" }
  | Exclude<CloudReadOutcome<never>, { kind: "ok" }>;
