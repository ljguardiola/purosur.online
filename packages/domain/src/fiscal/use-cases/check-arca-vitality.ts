import { isArcaVitalityAnswerOk } from "../model/arca-reachability.js";
import type { ArcaVitalityPorts } from "./arca-vitality-ports.js";

export type CheckArcaVitalityOutcome = { kind: "ok" } | { kind: "not_ok" };

export async function checkArcaVitality({
  vitality,
  store,
  clock,
}: ArcaVitalityPorts): Promise<CheckArcaVitalityOutcome> {
  const result = await vitality.check();
  const ok = result.kind === "answered" && isArcaVitalityAnswerOk(result);
  await store.recordVitalityCheck({ checkedAt: clock.now(), ok });
  return { kind: ok ? "ok" : "not_ok" };
}
