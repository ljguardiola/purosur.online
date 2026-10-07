import type { LimitedEndpoint } from "../../model/installation-request-limit.js";
import type { RequestAdmission, RequestAdmissionTransaction } from "../sync-ports.js";

export interface FakeAdmittedRequest {
  deviceId: string;
  endpoint: LimitedEndpoint;
  at: Date;
}

export class FakeRequestAdmission implements RequestAdmission {
  admitted: FakeAdmittedRequest[] = [];
  calls: string[] = [];
  failRecording = false;

  admittedAt(deviceId: string, endpoint: LimitedEndpoint): Date[] {
    return this.admitted
      .filter((request) => request.deviceId === deviceId && request.endpoint === endpoint)
      .map((request) => request.at);
  }

  async transaction<TOutcome>(
    work: (tx: RequestAdmissionTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const working = structuredClone(this.admitted);
    const outcome = await work({
      lockRequestAttempts: async (deviceId, endpoint) => {
        this.calls.push(`lockRequestAttempts ${deviceId} ${endpoint}`);
      },
      admittedRequests: async (deviceId, endpoint, since) => {
        this.calls.push(`admittedRequests ${deviceId} ${endpoint}`);
        return working
          .filter(
            (request) =>
              request.deviceId === deviceId && request.endpoint === endpoint && request.at > since,
          )
          .map((request) => request.at);
      },
      recordAdmittedRequest: async (deviceId, endpoint, at) => {
        this.calls.push(`recordAdmittedRequest ${deviceId} ${endpoint}`);
        if (this.failRecording) {
          throw new Error("the request could not be recorded");
        }
        working.push({ deviceId, endpoint, at });
      },
      forgetRequestsThrough: async (deviceId, endpoint, through) => {
        this.calls.push(`forgetRequestsThrough ${deviceId} ${endpoint}`);
        for (let index = working.length - 1; index >= 0; index -= 1) {
          const request = working[index];
          if (
            request?.deviceId === deviceId &&
            request.endpoint === endpoint &&
            request.at <= through
          ) {
            working.splice(index, 1);
          }
        }
      },
    });
    this.admitted = working.map((request) => ({ ...request, at: new Date(request.at) }));
    return outcome;
  }
}
