import type { CorrectRegisterClockOutcome, ReadClockGuardOutcome } from "@purosur/contracts";
import {
  type ClockLowering,
  type CorrectRegisterClockGrant,
  correctRegisterClock,
  type IdGenerator,
  readRegisterClockGuard,
} from "@purosur/domain/fiscal/use-cases";
import { inArgentinaTime } from "../platform/argentina-time";
import type { LocalDatabase } from "../platform/local-database";
import type { ActionGate } from "../sessions/action-gate";
import type { SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import {
  SqliteClockCorrectionLedger,
  SqliteRegisterClockGuardReader,
} from "./sqlite-clock-correction";

export interface ClockCorrectionRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  signedInPerson: Pick<SignedInPerson, "userId">;
  readOutboxChainKey: () => Promise<string | undefined>;
  now: () => Date;
  ids: IdGenerator;
}

type CorrectionRefusal = { kind: "not_signed_in" } | { kind: "not_permitted" };

function toWireLowering(lowering: ClockLowering) {
  return {
    point_of_sale: lowering.pointOfSale,
    document_type: lowering.documentType,
    previous_reading: lowering.previousReading.toISOString(),
    corrected_reading: lowering.correctedReading.toISOString(),
  };
}

export function readClockGuardFor({
  database,
  signedInPerson,
  now,
}: Pick<ClockCorrectionRequestDeps, "database" | "signedInPerson" | "now">): ReadClockGuardOutcome {
  const state = readRegisterClockGuard(
    {
      reader: new SqliteRegisterClockGuardReader(database, new SqliteSignInStore(database)),
      clock: { now },
    },
    { userId: signedInPerson.userId() },
  );
  return {
    kind: "read",
    reading: inArgentinaTime(state.reading),
    blocks: state.blocks.map((block) => ({
      point_of_sale: block.pointOfSale,
      document_type: block.documentType,
      latest_reading: block.latestReading === null ? null : inArgentinaTime(block.latestReading),
      tax_authority_last_authorized_issued_on: block.taxAuthorityLastIssuedOn,
    })),
    may_correct: state.mayCorrect,
    correction: state.correction,
  };
}

export async function correctRegisterClockFor({
  database,
  gate,
  readOutboxChainKey,
  now,
  ids,
}: ClockCorrectionRequestDeps): Promise<CorrectRegisterClockOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  if (outboxChainKey === undefined) {
    return { kind: "unavailable" };
  }
  const outcome = await correctRegisterClock<CorrectRegisterClockGrant, CorrectionRefusal>({
    ledger: new SqliteClockCorrectionLedger(
      database,
      new SqliteSignInStore(database),
      outboxChainKey,
    ),
    clock: { now },
    ids,
    authority: {
      async authorize() {
        const guarded = await gate.run(
          { kind: "correct_register_clock" },
          async ({ signedInUserId }) => signedInUserId,
        );
        if (guarded.kind === "performed") {
          return { kind: "granted", grant: { correctorId: guarded.result } };
        }
        return {
          kind: "refused",
          refusal: { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" },
        };
      },
    },
  });
  return outcome.kind === "corrected"
    ? { kind: "corrected", lowerings: outcome.lowerings.map(toWireLowering) }
    : outcome;
}
