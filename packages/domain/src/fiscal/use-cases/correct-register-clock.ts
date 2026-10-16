import { registerOperationAccess } from "../../register/index.js";
import type { Clock, OperationAuthority } from "../../shared/index.js";
import {
  type ClockLowering,
  clockCorrectedEvent,
  clockCorrectionPeriodKey,
  clockLoweringsFor,
} from "../model/clock-correction.js";
import type { ClockCorrectionLedger } from "./clock-correction-ports.js";
import type { IdGenerator } from "./sale-authorization-ports.js";

export interface CorrectRegisterClockGrant {
  correctorId: string;
}

export interface CorrectRegisterClockPorts<Grant extends CorrectRegisterClockGrant, Refusal> {
  ledger: ClockCorrectionLedger;
  clock: Clock;
  ids: IdGenerator;
  authority: OperationAuthority<Grant, Refusal>;
}

export type CorrectRegisterClockOutcome<Grant extends CorrectRegisterClockGrant> =
  | { kind: "not_permitted" }
  | { kind: "unavailable" }
  | { kind: "not_behind" }
  | { kind: "already_corrected_in_period" }
  | { kind: "corrected"; lowerings: ClockLowering[]; grant: Grant };

export async function correctRegisterClock<Grant extends CorrectRegisterClockGrant, Refusal>({
  ledger,
  clock,
  ids,
  authority,
}: CorrectRegisterClockPorts<Grant, Refusal>): Promise<
  CorrectRegisterClockOutcome<Grant> | Refusal
> {
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const { grant } = authorization;
  const { correctorId } = grant;

  return ledger.transaction<CorrectRegisterClockOutcome<Grant>>((tx) => {
    const corrector = { id: correctorId, access: tx.correctorAccess(correctorId) };
    if (
      registerOperationAccess({ kind: "correct_register_clock" }, corrector).kind !== "permitted"
    ) {
      return { kind: "not_permitted" };
    }
    const registerId = tx.registerId();
    if (registerId === undefined) {
      return { kind: "unavailable" };
    }
    const lowerings = clockLoweringsFor(tx.clockMarks(), clock.now());
    if (lowerings.length === 0) {
      return { kind: "not_behind" };
    }
    const period = clockCorrectionPeriodKey(tx.cashSessionStanding());
    if (tx.clockCorrectionRecordedIn(period)) {
      return { kind: "already_corrected_in_period" };
    }
    for (const lowering of lowerings) {
      tx.lowerClockMark(lowering);
      tx.recordClockCorrection({ period, registerId, actorId: correctorId, lowering });
      tx.appendOutboxEvent(
        clockCorrectedEvent({ eventId: ids.next(), registerId, actorId: correctorId, lowering }),
      );
    }
    return { kind: "corrected", lowerings, grant };
  });
}
