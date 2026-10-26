import {
  type ContingencyTicketRecoveryRequest,
  contingencyTicketRecoveryAnswerSchema,
} from "@purosur/contracts";
import type {
  ContingencyTicketRecoveryRequester,
  ContingencyTicketRecoveryStatus,
} from "@purosur/domain/backups/use-cases";
import type { PostToCloudWithBearer } from "../sync/cloud-event-inbox";
import { type CloudFailure, failureOf } from "../sync/cloud-failure";

export interface CloudContingencyTicketRecoveryDeps {
  post: PostToCloudWithBearer;
  deviceToken: string;
}

export class CloudContingencyTicketRecovery
  implements ContingencyTicketRecoveryRequester<CloudFailure>
{
  private readonly deps: CloudContingencyTicketRecoveryDeps;

  constructor(deps: CloudContingencyTicketRecoveryDeps) {
    this.deps = deps;
  }

  async ask(predecessorDeviceId: string): Promise<ContingencyTicketRecoveryStatus<CloudFailure>> {
    const body: ContingencyTicketRecoveryRequest = { predecessor_device_id: predecessorDeviceId };
    const response = await this.deps.post(
      "/api/devices/current/contingency-ticket-recovery",
      this.deps.deviceToken,
      body,
    );
    if (response.kind !== "ok") {
      return { kind: "failed", failure: failureOf(response) };
    }
    const answer = contingencyTicketRecoveryAnswerSchema.safeParse(response.body);
    if (!answer.success) {
      return { kind: "failed", failure: { kind: "unreadable" } };
    }
    return { kind: answer.data.status };
  }
}
