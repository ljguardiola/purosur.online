import type { RegisterHealthCheck, RegisterHealthChecks } from "../register-health-check-ports.js";

export class FakeRegisterHealthChecks implements RegisterHealthChecks {
  readonly recorded: { check: RegisterHealthCheck; keepLast: number }[] = [];

  async recordHealthCheck(check: RegisterHealthCheck, keepLast: number): Promise<void> {
    this.recorded.push({ check: { ...check, checkedAt: new Date(check.checkedAt) }, keepLast });
  }
}
