import { type PushEventsRequest, pushEventsResponseSchema } from "@purosur/contracts";
import type { PushedEvent, RegisterTelemetry } from "@purosur/domain";
import type {
  CloudEventInboxAnswer,
  CloudEventInbox as CloudEventInboxPort,
} from "@purosur/domain/sync/use-cases";
import type { CloudResponse } from "../platform/cloud-client";
import { type CloudFailure, failureOf } from "./cloud-failure";

export type PostToCloudWithBearer = (
  path: string,
  bearerToken: string,
  body: unknown,
) => Promise<CloudResponse>;

export interface CloudEventInboxDeps {
  post: PostToCloudWithBearer;
  deviceToken: string;
  appVersion: string;
  readTelemetry: () => Promise<RegisterTelemetry>;
}

export class CloudEventInbox implements CloudEventInboxPort<CloudFailure> {
  private readonly deps: CloudEventInboxDeps;

  constructor(deps: CloudEventInboxDeps) {
    this.deps = deps;
  }

  async push(events: readonly PushedEvent[]): Promise<CloudEventInboxAnswer<CloudFailure>> {
    const body: PushEventsRequest = {
      app_version: this.deps.appVersion,
      telemetry: await this.deps.readTelemetry(),
      events: [...events],
    };
    const response = await this.deps.post("/api/events", this.deps.deviceToken, body);
    if (response.kind === "error" && response.error.code === "revoked") {
      return { kind: "revoked" };
    }
    if (response.kind !== "ok") {
      return { kind: "failed", failure: failureOf(response) };
    }
    const answer = pushEventsResponseSchema.safeParse(response.body);
    if (!answer.success) {
      return { kind: "failed", failure: { kind: "unreadable" } };
    }
    switch (answer.data.status) {
      case "ok":
        return { kind: "received", ackSeq: answer.data.ack_seq };
      case "expected_seq":
        return { kind: "gap", ackSeq: answer.data.ack_seq, expectedSeq: answer.data.expected_seq };
      case "stale_device":
        return { kind: "stale_device", ackSeq: answer.data.ack_seq };
    }
  }
}
