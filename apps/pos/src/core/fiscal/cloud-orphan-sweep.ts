import { restoredRegisterOrphanSweepResponseSchema } from "@purosur/contracts";
import type { OrphanSweepAnswer, OrphanSweepRequester } from "@purosur/domain/register/use-cases";
import type { PostToCloudWithBearer } from "../sync/cloud-event-inbox";
import { type CloudFailure, failureOf } from "../sync/cloud-failure";

export interface CloudOrphanSweepDeps {
  post: PostToCloudWithBearer;
  deviceToken: string;
}

export class CloudOrphanSweep implements OrphanSweepRequester<CloudFailure> {
  private readonly deps: CloudOrphanSweepDeps;

  constructor(deps: CloudOrphanSweepDeps) {
    this.deps = deps;
  }

  async requestSweep(): Promise<OrphanSweepAnswer<CloudFailure>> {
    const response = await this.deps.post(
      "/api/devices/current/orphan-sweep",
      this.deps.deviceToken,
      {},
    );
    if (response.kind !== "ok") {
      return { kind: "failed", failure: failureOf(response) };
    }
    const answer = restoredRegisterOrphanSweepResponseSchema.safeParse(response.body);
    if (!answer.success) {
      return { kind: "failed", failure: { kind: "unreadable" } };
    }
    return answer.data.state === "SWEPT" ? { kind: "swept" } : { kind: "numbering_not_reconciled" };
  }
}
