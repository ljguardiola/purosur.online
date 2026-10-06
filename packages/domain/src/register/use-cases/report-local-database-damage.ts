import type { RegisterService } from "../model/register-service.js";
import type { LocalDatabaseHealthPorts } from "./local-database-health.js";

export async function reportLocalDatabaseDamage({
  health,
}: LocalDatabaseHealthPorts): Promise<RegisterService> {
  await health.recordDamage();
  return { kind: "out_of_service" };
}
