import { type RestorationStanding, restorationStanding } from "@purosur/domain";
import type { RestorationProtocolEvidence } from "@purosur/domain/register/use-cases";

export function restorationStandingFor(
  restoration: RestorationProtocolEvidence,
): RestorationStanding {
  return restorationStanding(restoration.evidence());
}
