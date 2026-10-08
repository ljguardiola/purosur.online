import { quietRegisterObservation } from "../model/alert-condition-observation.js";
import { isRegisterQuiet } from "../model/quiet-register.js";
import type { AlertClosingPorts } from "./alert-store.js";
import type { InServiceRegisterReader } from "./in-service-register-reader.js";
import { observeAlertCondition } from "./observe-alert-condition.js";

export interface QuietRegisterDetectionPorts extends AlertClosingPorts {
  registers: InServiceRegisterReader;
}

export async function detectQuietRegisters(ports: QuietRegisterDetectionPorts): Promise<number> {
  const now = ports.clock.now();
  const registers = await ports.registers.inServiceRegisters();
  const quiet = registers.filter((register) => isRegisterQuiet({ ...register, now }));
  for (const register of quiet) {
    await observeAlertCondition(ports, quietRegisterObservation(register));
  }
  return quiet.length;
}
