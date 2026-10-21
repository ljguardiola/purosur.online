import type { RestoredCreditNoteAnswer } from "../../fiscal/index.js";
import type { SyncedFact } from "../model/synced-fact.js";
import type {
  RegisterPredecessor,
  ReplenishmentPage,
  ReplenishmentRefusal,
  ReplenishRestoredRegisterPorts,
} from "./register-replenishment-ports.js";
import type { EventPosition, ReplenishedEvent } from "./restored-register-replenishment-ports.js";

export type ReplenishRestoredRegisterOutcome<TFailure> =
  | { kind: "nothing_to_replenish" }
  | { kind: "replenished" }
  | { kind: "partially_replenished"; unapplied: number }
  | { kind: "refused"; refusal: ReplenishmentRefusal }
  | { kind: "unreachable" }
  | { kind: "failed"; failure: TFailure }
  | { kind: "unreadable_event"; eventId: string; reason: string };

interface DecodedPageEvent {
  replenished: ReplenishedEvent;
  fact: SyncedFact;
}

type DecodedPage =
  | { kind: "decoded"; events: DecodedPageEvent[] }
  | { kind: "unreadable"; eventId: string; reason: string };

function decodedPage<TFailure>(
  { decoder }: ReplenishRestoredRegisterPorts<TFailure>,
  { events }: ReplenishmentPage,
): DecodedPage {
  const decoded: DecodedPageEvent[] = [];
  for (const replenished of events) {
    const answer = decoder.decode(replenished);
    if (answer.kind === "unreadable") {
      return { kind: "unreadable", eventId: replenished.event.event_id, reason: answer.reason };
    }
    decoded.push({ replenished, fact: answer.fact });
  }
  return { kind: "decoded", events: decoded };
}

async function applyPage<TFailure>(
  { store }: ReplenishRestoredRegisterPorts<TFailure>,
  {
    events,
    creditNoteAnswers,
  }: {
    events: readonly DecodedPageEvent[];
    creditNoteAnswers: readonly RestoredCreditNoteAnswer[];
  },
): Promise<number> {
  return store.transaction(async (tx) => {
    let unapplied = 0;
    for (const { replenished, fact } of events) {
      const { event, deviceId } = replenished;
      if (await tx.eventApplied(event.event_id)) {
        continue;
      }
      const application = await tx.applyFact(fact, { eventId: event.event_id, deviceId });
      if (application === "not_yet_applicable") {
        unapplied += 1;
        continue;
      }
      if (
        fact.kind === "fiscal_gate_failed" &&
        !(await tx.holdsDeferredSaleRecord(fact.gateFailure.saleId))
      ) {
        unapplied += 1;
        continue;
      }
      if (fact.kind === "sale_voided" && fact.creditNote !== null) {
        const { creditNoteId } = fact.creditNote;
        const answer = creditNoteAnswers.find((answered) => answered.creditNoteId === creditNoteId);
        if (answer === undefined) {
          unapplied += 1;
          continue;
        }
        await tx.recordCreditNoteAnswer(fact.creditNote, answer);
      }
      await tx.recordEventApplied(event.event_id);
    }
    return unapplied;
  });
}

export async function replenishRestoredRegister<TFailure>(
  ports: ReplenishRestoredRegisterPorts<TFailure>,
): Promise<ReplenishRestoredRegisterOutcome<TFailure>> {
  const predecessor: RegisterPredecessor | undefined = await ports.store.predecessor();
  if (predecessor === undefined) {
    return { kind: "nothing_to_replenish" };
  }
  let after: EventPosition | undefined;
  let unapplied = 0;
  for (;;) {
    const answer = await ports.feed.pageAfter(predecessor, after);
    if (answer.kind === "refused") {
      return { kind: "refused", refusal: answer.refusal };
    }
    if (answer.kind === "unreachable") {
      return { kind: "unreachable" };
    }
    if (answer.kind === "failed") {
      return { kind: "failed", failure: answer.failure };
    }
    await ports.store.applyUsers(answer.page.users);
    const decoded = decodedPage(ports, answer.page);
    if (decoded.kind === "unreadable") {
      return { kind: "unreadable_event", eventId: decoded.eventId, reason: decoded.reason };
    }
    unapplied += await applyPage(ports, {
      events: decoded.events,
      creditNoteAnswers: answer.page.creditNoteAnswers,
    });
    if (answer.page.next === null) {
      break;
    }
    after = answer.page.next;
  }
  if (unapplied > 0) {
    return { kind: "partially_replenished", unapplied };
  }
  await ports.store.finish();
  return { kind: "replenished" };
}
