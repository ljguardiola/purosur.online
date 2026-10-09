import { ROUND_TRIP_SAMPLE_SIZE } from "../model/real-time-authorization.js";
import type {
  RegisterHealthCheck,
  RegisterHealthCheckPorts,
} from "./register-health-check-ports.js";

export type RecordRegisterHealthCheckOutcome = { kind: "recorded" };

export async function recordRegisterHealthCheck(
  { healthChecks }: RegisterHealthCheckPorts,
  check: RegisterHealthCheck,
): Promise<RecordRegisterHealthCheckOutcome> {
  await healthChecks.recordHealthCheck(check, ROUND_TRIP_SAMPLE_SIZE);
  return { kind: "recorded" };
}
