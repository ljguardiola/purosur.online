import { healthCheckSchema } from "@purosur/contracts";
import type {
  CloudInstallationCheck as CloudInstallationCheckPort,
  CloudInstallationStanding,
} from "@purosur/domain/sync/use-cases";
import { type CloudFailure, failureOf } from "./cloud-failure";
import type { GetFromCloud } from "./cloud-pull-feed";

export class CloudInstallationCheck implements CloudInstallationCheckPort<CloudFailure> {
  private readonly get: GetFromCloud;
  private readonly deviceToken: string;

  constructor(get: GetFromCloud, deviceToken: string) {
    this.get = get;
    this.deviceToken = deviceToken;
  }

  async standing(): Promise<CloudInstallationStanding<CloudFailure>> {
    const response = await this.get("/api/health", {
      authorization: `Bearer ${this.deviceToken}`,
    });
    if (response.kind !== "ok") {
      return { kind: "failed", failure: failureOf(response) };
    }
    const health = healthCheckSchema.safeParse(response.body);
    if (!health.success || health.data.installation === undefined) {
      return { kind: "failed", failure: { kind: "unreadable" } };
    }
    return health.data.installation.revoked ? { kind: "revoked" } : { kind: "in_service" };
  }
}
