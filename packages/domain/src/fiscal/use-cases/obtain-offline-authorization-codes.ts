import { argentinaCalendarDay } from "../../shared/index.js";
import type { TaxAuthorityRejection } from "../model/fiscal-rejection-alert.js";
import {
  type Fortnight,
  fortnightsWithinRequestWindowOn,
  isSameFortnight,
} from "../model/offline-authorization-code.js";
import type {
  OfflineAuthorizationCode,
  OfflineAuthorizationCodeAcquisition,
  OfflineAuthorizationCodeOrigin,
  OfflineAuthorizationCodePorts,
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
  { tokens, taxAuthority, clock }: OfflineAuthorizationCodePorts,
  fortnight: Fortnight,
  acquisition: OfflineAuthorizationCodeAcquisition,
): Promise<FortnightAcquisitionOutcome> {
  if (await acquisition.isHeld()) {
    return { kind: "held" };
  }
  const token = await tokens.validToken();
  if (token === null) {
    return { kind: "no_token" };
  }

  const keep = async (
    code: OfflineAuthorizationCode,
    obtainedThrough: OfflineAuthorizationCodeOrigin,
  ): Promise<boolean> => {
    if (!isSameFortnight(code.fortnight, fortnight)) {
      return false;
    }
    await acquisition.keep({ code, obtainedAt: clock.now(), obtainedThrough });
    return true;
  };

  const answer = await taxAuthority.request({ token, fortnight });
  switch (answer.kind) {
    case "granted":
      return (await keep(answer.code, "requested"))
        ? { kind: "obtained" }
        : { kind: "unexpected_fortnight" };
    case "already_granted": {
      const lookup = await taxAuthority.lookUp({ token, fortnight });
      if (lookup.kind !== "granted") {
        return { kind: "not_recovered" };
      }
      return (await keep(lookup.code, "recovered"))
        ? { kind: "recovered" }
        : { kind: "unexpected_fortnight" };
    }
    case "refused":
      return { kind: "refused", rejections: answer.rejections };
    case "no_answer":
      return { kind: "no_answer" };
  }
}
