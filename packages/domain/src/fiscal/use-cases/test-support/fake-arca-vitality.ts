import type {
  ArcaVitalityResult,
  ArcaVitalityService,
  ArcaVitalityStore,
  VitalityCheckRecord,
} from "../arca-vitality-ports.js";

export class FakeArcaVitalityService implements ArcaVitalityService {
  private readonly result: ArcaVitalityResult;
  private readonly whileChecking: () => void;

  constructor(result: ArcaVitalityResult, whileChecking: () => void = () => {}) {
    this.result = result;
    this.whileChecking = whileChecking;
  }

  async check(): Promise<ArcaVitalityResult> {
    this.whileChecking();
    return this.result;
  }
}

export class FakeArcaVitalityStore implements ArcaVitalityStore {
  checks: VitalityCheckRecord[] = [];

  async recordVitalityCheck(check: VitalityCheckRecord): Promise<void> {
    this.checks.push({ checkedAt: new Date(check.checkedAt), ok: check.ok });
  }
}

export class ManualClock {
  private moment: Date;

  constructor(moment: Date) {
    this.moment = moment;
  }

  now(): Date {
    return new Date(this.moment);
  }

  advanceBy(ms: number): void {
    this.moment = new Date(this.moment.getTime() + ms);
  }
}
