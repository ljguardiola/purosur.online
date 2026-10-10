import type {
  QuarantineRelease,
  QuarantineReleaseTransaction,
} from "../quarantine-release-ports.js";
import type { FakeEventApplication } from "./fake-event-application.js";

export interface FakeRegister {
  deviceId: string;
  locationId: string;
}

export class FakeQuarantineRelease implements QuarantineRelease {
  calls: string[] = [];
  failRecordingRelease = false;
  failResolvingAlert = false;
  private readonly application: FakeEventApplication;
  private readonly registers: readonly FakeRegister[];

  constructor(application: FakeEventApplication, registers: readonly FakeRegister[]) {
    this.application = application;
    this.registers = registers;
  }

  async transaction<T>(work: (tx: QuarantineReleaseTransaction) => Promise<T>): Promise<T> {
    const snapshot = structuredClone(this.application.state);
    this.calls.push("begin");
    try {
      const result = await work(this.transactionObject());
      this.calls.push("commit");
      return result;
    } catch (error) {
      this.application.state = snapshot;
      this.calls.push("rollback");
      throw error;
    }
  }

  private transactionObject(): QuarantineReleaseTransaction {
    return {
      aggregateOfEventInBranch: async (eventId, locationId) => {
        this.calls.push(`find aggregate of ${eventId}`);
        const event = this.application.state.events.find((one) => one.eventId === eventId);
        const register = this.registers.find((one) => one.deviceId === event?.deviceId);
        if (event === undefined || register?.locationId !== locationId) {
          return undefined;
        }
        return { aggregateType: event.aggregateType, aggregateId: event.aggregateId };
      },
      lockAggregateWaiting: async (key) => {
        this.calls.push(`wait for ${key.aggregateType}/${key.aggregateId}`);
      },
      lockEvent: async (eventId) => {
        this.calls.push(`lock event ${eventId}`);
        const event = this.application.state.events.find((one) => one.eventId === eventId);
        if (event === undefined) {
          return undefined;
        }
        const { appliedAt, quarantinedAt, nextAttemptAt, attempts, error } = event;
        return { appliedAt, quarantinedAt, nextAttemptAt, attempts, lastError: error };
      },
      releaseForNewSeries: async (eventId, released) => {
        this.calls.push(`release ${eventId}`);
        Object.assign(this.application.event(eventId), released);
      },
      recordRelease: async (record) => {
        this.calls.push(`record release of ${record.eventId}`);
        if (this.failRecordingRelease) {
          throw new Error("audit log unavailable");
        }
        this.application.state.releases.push(record);
      },
      resolveQuarantineAlert: async (eventId) => {
        this.calls.push(`resolve alert of ${eventId}`);
        if (this.failResolvingAlert) {
          throw new Error("alert store unavailable");
        }
        this.application.state.quarantineAlerts = this.application.state.quarantineAlerts.filter(
          (alert) => alert.eventId !== eventId,
        );
        this.application.state.resolvedQuarantineAlerts.push(eventId);
      },
    };
  }
}
