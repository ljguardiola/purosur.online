import type { RegisterService } from "../model/register-service.js";
import type { LocalDatabaseHealthPorts } from "./local-database-health.js";

export async function checkLocalDatabase({
  health,
}: LocalDatabaseHealthPorts): Promise<RegisterService> {
  if (await health.damageRecorded()) {
    return { kind: "out_of_service" };
  }
  if (await health.integrityHolds()) {
    return { kind: "in_service" };
  }
  await health.recordDamage();
  return { kind: "out_of_service" };
}
