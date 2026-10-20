import { argentinaCalendarDay } from "../../shared/index.js";
import type { TaxAuthorityRejection } from "../model/fiscal-rejection-standing.js";
import {
  type Fortnight,
  fortnightsWithinRequestWindowOn,
  isSameFortnight,
} from "../model/offline-authorization-code.js";
import type { WithOwedPresentations } from "../model/owed-presentation-list.js";
import type {
  OfflineAuthorizationCode,
  OfflineAuthorizationCodeAcquisition,
  OfflineAuthorizationCodeOrigin,
  OfflineAuthorizationCodePorts,
  OfflineAuthorizationCodeRequestAnswer,
} from "./offline-authorization-code-ports.js";

export type FortnightAcquisitionOutcome =
  | { kind: "obtained" }
  | { kind: "recovered" }
  | { kind: "held" }
  | { kind: "no_token" }
  | { kind: "refused"; rejections: TaxAuthorityRejection[] }
  | { kind: "no_answer" }
  | { kind: "not_recovered" }
  | { kind: "unexpected_fortnight" };

export type ObtainOfflineAuthorizationCodesOutcome =
  | { kind: "no_offline_point_of_sale" }
  | {
      kind: "attempted";
      fortnights: { fortnight: Fortnight; outcome: FortnightAcquisitionOutcome }[];
    };

export async function obtainOfflineAuthorizationCodes(
  ports: OfflineAuthorizationCodePorts,
): Promise<ObtainOfflineAuthorizationCodesOutcome> {
  if (!(await ports.store.hasOfflinePointOfSale())) {
    return { kind: "no_offline_point_of_sale" };
  }
  const fortnights: { fortnight: Fortnight; outcome: FortnightAcquisitionOutcome }[] = [];
  for (const fortnight of fortnightsWithinRequestWindowOn(
    argentinaCalendarDay(ports.clock.now()),
  )) {
    const outcome = await ports.store.holdAcquisition(fortnight, (acquisition) =>
      obtainFortnightCode(ports, fortnight, acquisition),
    );
    fortnights.push({ fortnight, outcome });
  }
  return { kind: "attempted", fortnights };
}

async function obtainFortnightCode(
  ports: OfflineAuthorizationCodePorts,
  fortnight: Fortnight,
  acquisition: OfflineAuthorizationCodeAcquisition,
): Promise<FortnightAcquisitionOutcome> {
  if (await acquisition.isHeld()) {
    return { kind: "held" };
  }
  const token = await ports.tokens.validToken();
  if (token === null) {
    return { kind: "no_token" };
  }

  const answer = await ports.taxAuthority.request({ token, fortnight });
  if (answer.kind !== "already_granted") {
    const outcome = await requestOutcome(ports, fortnight, acquisition, answer);
    await recordList(ports, answer);
    if (answer.kind === "granted" && answer.owedPresentations === undefined) {
      await ports.owedPresentations.clearOwedElsewhere(await ports.store.ownedPointsOfSale());
    }
    return outcome;
  }
  const lookup = await ports.taxAuthority.lookUp({ token, fortnight });
  const outcome =
    lookup.kind === "granted"
      ? await keep(ports, fortnight, acquisition, lookup.code, "recovered")
      : { kind: "not_recovered" as const };
  await recordList(ports, answer);
  await recordList(ports, lookup);
  return outcome;
}

async function requestOutcome(
  ports: OfflineAuthorizationCodePorts,
  fortnight: Fortnight,
  acquisition: OfflineAuthorizationCodeAcquisition,
  answer: Exclude<OfflineAuthorizationCodeRequestAnswer, { kind: "already_granted" }>,
): Promise<FortnightAcquisitionOutcome> {
  switch (answer.kind) {
    case "granted":
      return keep(ports, fortnight, acquisition, answer.code, "requested");
    case "refused":
      return { kind: "refused", rejections: answer.rejections };
    case "no_answer":
      return { kind: "no_answer" };
  }
}

async function keep(
  { clock }: OfflineAuthorizationCodePorts,
  fortnight: Fortnight,
  acquisition: OfflineAuthorizationCodeAcquisition,
  code: OfflineAuthorizationCode,
  obtainedThrough: OfflineAuthorizationCodeOrigin,
): Promise<FortnightAcquisitionOutcome> {
  if (!isSameFortnight(code.fortnight, fortnight)) {
    return { kind: "unexpected_fortnight" };
  }
  await acquisition.keep({ code, obtainedAt: clock.now(), obtainedThrough });
  return { kind: obtainedThrough === "requested" ? "obtained" : "recovered" };
}

async function recordList(
  { owedPresentations, clock }: OfflineAuthorizationCodePorts,
  answer: WithOwedPresentations<object>,
): Promise<void> {
  if (answer.owedPresentations !== undefined) {
    await owedPresentations.replace(answer.owedPresentations, clock.now());
  }
}
