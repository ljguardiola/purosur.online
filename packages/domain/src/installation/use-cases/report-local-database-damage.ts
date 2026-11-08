import type { LocalDatabaseHealthPorts } from "../../shared/index.js";
import type { RegisterService } from "../model/register-service.js";

export async function reportLocalDatabaseDamage({
  health,
}: LocalDatabaseHealthPorts): Promise<RegisterService> {
  await health.recordDamage();
  return { kind: "out_of_service" };
}
