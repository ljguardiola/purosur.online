import { FACTURA_C_DOCUMENT_TYPE, type OutboxEventDraft, type RoleAccess } from "@purosur/domain";
import type {
  CashSessionStanding,
  ClockCorrectionLedger,
  ClockCorrectionRecord,
  ClockCorrectionTransaction,
  ClockLowering,
  ClockMark,
  RegisterClockGuardReader,
  TaxAuthorityFloor,
} from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { SignInStore } from "../sessions/sqlite-sign-in-store";
import { appendOutboxEvent } from "../sync/sqlite-outbox";

type People = Pick<SignInStore, "activePerson">;

function correctorAccess(people: People, userId: string): RoleAccess | undefined {
  return people.activePerson(userId)?.access;
}

function clockMarks(database: LocalDatabase): ClockMark[] {
  return database
    .prepare<[], { point_of_sale: number; document_type: string; reading: string }>(
      "SELECT point_of_sale, document_type, reading FROM register_clock_marks ORDER BY point_of_sale",
    )
    .all()
    .map((row) => ({
      pointOfSale: row.point_of_sale,
      documentType: FACTURA_C_DOCUMENT_TYPE,
      reading: new Date(row.reading),
    }));
}

function cashSessionStanding(database: LocalDatabase): CashSessionStanding {
  const open = database
    .prepare<[], { id: string }>("SELECT id FROM cash_sessions WHERE state = 'OPEN'")
    .get();
  const lastClosed = database
    .prepare<[], { id: string }>(
      "SELECT id FROM cash_sessions WHERE state = 'CLOSED' ORDER BY closed_at DESC, id DESC LIMIT 1",
    )
    .get();
  return { openSessionId: open?.id ?? null, lastClosedSessionId: lastClosed?.id ?? null };
}

function clockCorrectionRecordedIn(database: LocalDatabase, period: string): boolean {
  return (
    database.prepare("SELECT 1 FROM clock_corrections WHERE period = ? LIMIT 1").get(period) !==
    undefined
  );
}

export class SqliteClockCorrectionLedger implements ClockCorrectionLedger {
  private readonly database: LocalDatabase;
  private readonly people: People;
  private readonly outboxChainKey: string | undefined;

  constructor(database: LocalDatabase, people: People, outboxChainKey: string | undefined) {
    this.database = database;
    this.people = people;
    this.outboxChainKey = outboxChainKey;
  }

  transaction<TOutcome>(work: (tx: ClockCorrectionTransaction) => TOutcome): TOutcome {
    return this.database.transaction(() => work(this.transactionScope()))();
  }

  private transactionScope(): ClockCorrectionTransaction {
    const { database } = this;
    return {
      correctorAccess: (userId) => correctorAccess(this.people, userId),
      registerId: () =>
        database.prepare<[], { id: string }>("SELECT id FROM own_register WHERE removed = 0").get()
          ?.id,
      cashSessionStanding: () => cashSessionStanding(database),
      clockMarks: () => clockMarks(database),
      clockCorrectionRecordedIn: (period) => clockCorrectionRecordedIn(database, period),
      lowerClockMark: ({ pointOfSale, documentType, correctedReading }: ClockLowering) => {
        database
          .prepare(
            "UPDATE register_clock_marks SET reading = ? WHERE point_of_sale = ? AND document_type = ?",
          )
          .run(correctedReading.toISOString(), pointOfSale, documentType);
      },
      recordClockCorrection: ({ period, registerId, actorId, lowering }: ClockCorrectionRecord) => {
        database
          .prepare(
            `INSERT INTO clock_corrections (
               period, register_id, actor_id, point_of_sale, document_type, previous_reading, corrected_reading
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            period,
            registerId,
            actorId,
            lowering.pointOfSale,
            lowering.documentType,
            lowering.previousReading.toISOString(),
            lowering.correctedReading.toISOString(),
          );
      },
      appendOutboxEvent: (event: OutboxEventDraft) => {
        if (this.outboxChainKey === undefined) {
          throw new Error("the ledger has no outbox chain key");
        }
        appendOutboxEvent(database, this.outboxChainKey, event);
      },
    };
  }
}

export class SqliteRegisterClockGuardReader implements RegisterClockGuardReader {
  private readonly database: LocalDatabase;
  private readonly people: People;

  constructor(database: LocalDatabase, people: People) {
    this.database = database;
    this.people = people;
  }

  correctorAccess(userId: string): RoleAccess | undefined {
    return correctorAccess(this.people, userId);
  }

  clockMarks(): ClockMark[] {
    return clockMarks(this.database);
  }

  taxAuthorityFloor(): TaxAuthorityFloor | null {
    const row = this.database
      .prepare<[], { point_of_sale: number; last_issued_on: string | null }>(
        `SELECT register_point_of_sale.point_of_sale_number AS point_of_sale,
                register_point_of_sale.tax_authority_last_authorized_issued_on AS last_issued_on
         FROM register_point_of_sale
         JOIN own_register ON own_register.id = register_point_of_sale.register_id
         WHERE own_register.removed = 0`,
      )
      .get();
    return row === undefined || row.last_issued_on === null
      ? null
      : {
          pointOfSale: row.point_of_sale,
          documentType: FACTURA_C_DOCUMENT_TYPE,
          lastIssuedOn: row.last_issued_on,
        };
  }

  cashSessionStanding(): CashSessionStanding {
    return cashSessionStanding(this.database);
  }

  clockCorrectionRecordedIn(period: string): boolean {
    return clockCorrectionRecordedIn(this.database, period);
  }
}
