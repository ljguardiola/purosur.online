import {
  type RegisterResetRequest,
  type RegisterResetResponse,
  registerResetResponseSchema,
} from "@purosur/contracts";
import type { RestoredCreditNoteAnswer, RestoredUnclearDeferral } from "@purosur/domain";
import type {
  EventPosition,
  RegisterPredecessor,
  RegisterReplenishmentFeed,
  RegisterReplenishmentFeedAnswer,
  ReplenishmentRefusal,
} from "@purosur/domain/sync/use-cases";
import type { PostToCloudWithBearer } from "./cloud-event-inbox";
import { type CloudFailure, failureOf } from "./cloud-failure";

export interface CloudRegisterReplenishmentDeps {
  post: PostToCloudWithBearer;
  deviceToken: string;
}

const REFUSALS: readonly ReplenishmentRefusal[] = [
  "predecessor_not_of_register",
  "predecessor_not_revoked",
  "cursor_not_of_replenishment",
];

function refusalOf(code: string): ReplenishmentRefusal | undefined {
  return REFUSALS.find((refusal) => refusal === code);
}

type WireCreditNote = RegisterResetResponse["credit_notes"][number];

function answerOf(creditNote: WireCreditNote): RestoredCreditNoteAnswer["answer"] {
  switch (creditNote.state) {
    case "AUTHORIZED":
      return {
        kind: "authorized",
        pointOfSale: creditNote.point_of_sale,
        number: creditNote.number,
        issuedOn: creditNote.issued_on,
        issuedAt: new Date(creditNote.issued_at),
        authorizationCode: creditNote.authorization_code,
        authorizationCodeDueOn: creditNote.authorization_code_due_on,
      };
    case "REJECTED":
      return { kind: "rejected" };
    case "ALREADY_CREDITED":
      return { kind: "already_credited" };
  }
}

type WireUnclearDeferral = RegisterResetResponse["unclear_deferrals"][number];

function unclearDeferralOf(deferral: WireUnclearDeferral): RestoredUnclearDeferral {
  const fiscalDocumentId = deferral.fiscal_document_id;
  switch (deferral.state) {
    case "UNSETTLED":
      return { fiscalDocumentId, answer: { kind: "unsettled" } };
    case "REJECTED":
      return {
        fiscalDocumentId,
        answer: { kind: "rejected", answeredAt: new Date(deferral.answered_at) },
      };
    case "AUTHORIZED":
      return {
        fiscalDocumentId,
        answer: {
          kind: "authorized",
          authorizationCode: deferral.authorization_code,
          authorizationCodeDueOn: deferral.authorization_code_due_on,
          answeredAt: new Date(deferral.answered_at),
        },
      };
  }
}

export class CloudRegisterReplenishment implements RegisterReplenishmentFeed<CloudFailure> {
  private readonly deps: CloudRegisterReplenishmentDeps;

  constructor(deps: CloudRegisterReplenishmentDeps) {
    this.deps = deps;
  }

  async pageAfter(
    predecessor: RegisterPredecessor,
    after: EventPosition | undefined,
  ): Promise<RegisterReplenishmentFeedAnswer<CloudFailure>> {
    const body: RegisterResetRequest = {
      predecessor_device_id: predecessor.deviceId,
      last_acknowledged_seq: predecessor.lastAcknowledgedSeq,
      ...(after && { after: { device_id: after.deviceId, device_seq: after.deviceSeq } }),
    };
    const response = await this.deps.post(
      "/api/devices/current/reset",
      this.deps.deviceToken,
      body,
    );
    if (response.kind === "unreachable") {
      return { kind: "unreachable" };
    }
    if (response.kind === "error") {
      const refusal = refusalOf(response.error.code);
      return refusal === undefined
        ? { kind: "failed", failure: failureOf(response) }
        : { kind: "refused", refusal };
    }
    const answer = registerResetResponseSchema.safeParse(response.body);
    if (!answer.success) {
      return { kind: "failed", failure: { kind: "unreadable" } };
    }
    const {
      events,
      users,
      next,
      credit_notes: creditNotes,
      unrequested_credit_note_ids: unrequestedCreditNoteIds,
      unclear_deferrals: unclearDeferrals,
    } = answer.data;
    return {
      kind: "page",
      page: {
        events: events.map(({ device_id: deviceId, ...event }) => ({ deviceId, event })),
        users: users.map((user) => ({
          userId: user.user_id,
          firstName: user.first_name,
          roleId: user.role_id,
          salt: user.salt,
          pinHash: user.pin_hash,
          active: user.active,
          version: user.version,
        })),
        creditNoteAnswers: creditNotes.map((creditNote) => ({
          creditNoteId: creditNote.credit_note_id,
          answeredAt: new Date(creditNote.answered_at),
          answer: answerOf(creditNote),
        })),
        unrequestedCreditNoteIds,
        unclearDeferralAnswers: unclearDeferrals.map(unclearDeferralOf),
        next: next && { deviceId: next.device_id, deviceSeq: next.device_seq },
      },
    };
  }
}
