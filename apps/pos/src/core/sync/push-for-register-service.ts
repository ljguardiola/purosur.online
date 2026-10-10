import type { RegisterService } from "@purosur/domain";
import type { PushAttempt } from "./push-to-cloud";

export interface RegisterServicePushDeps {
  service: RegisterService;
  pushOutbox: () => Promise<PushAttempt>;
  reportDamagedDatabase: (() => Promise<PushAttempt>) | undefined;
}

export async function pushForRegisterService(deps: RegisterServicePushDeps): Promise<PushAttempt> {
  if (deps.service.kind === "in_service") {
    return deps.pushOutbox();
  }
  if (deps.reportDamagedDatabase === undefined) {
    return { kind: "no_local_database" };
  }
  return deps.reportDamagedDatabase();
}
