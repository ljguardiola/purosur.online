import { dueOffsiteDumpNight } from "../../backups/index.js";
import {
  offsiteDumpUnverifiedObservation,
  offsiteDumpVerifiedObservation,
} from "../model/alert-condition-observation.js";
import type { OffsiteDumpUnverifiedReason } from "../model/offsite-dump-unverified-reason.js";
import type { UnverifiedOffsiteDumpDetectionPorts } from "./unverified-offsite-dump-ports.js";

export type DetectUnverifiedOffsiteDumpOutcome =
  | { kind: "verified"; night: string }
  | { kind: "unverified"; night: string; reason: OffsiteDumpUnverifiedReason };

export async function detectUnverifiedOffsiteDump(
  { checks, alerts, clock }: UnverifiedOffsiteDumpDetectionPorts,
  { environment }: { environment: string },
): Promise<DetectUnverifiedOffsiteDumpOutcome> {
  const night = dueOffsiteDumpNight(clock.now());
  const check = await checks.offsiteDumpCheckOf(night);
  if (check?.status === "verified") {
    await alerts.observeAlertCondition(offsiteDumpVerifiedObservation(environment));
    return { kind: "verified", night };
  }
  const reason = check?.reason ?? "not_reported";
  await alerts.observeAlertCondition(
    offsiteDumpUnverifiedObservation({ environment, night, reason }),
  );
  return { kind: "unverified", night, reason };
}
