import {
  CONTINGENCY_BACKUP_OPERATIONS,
  type ContingencyBackupOperation,
  type ContingencyBackupTicketRecord,
  customerDocumentPrinted,
} from "@purosur/domain";
import type {
  ContingencyBackupTicketStore,
  DiscardContingencyBackupTicketsTransaction,
  NewContingencyBackupTicket,
  PrintContingencyBackupTicketTransaction,
  RecordContingencyBackupTicketTransaction,
} from "@purosur/domain/backups/use-cases";
import type { LocalDatabase } from "../platform/local-database";

type ContingencyBackupTicketsTransaction = RecordContingencyBackupTicketTransaction &
  PrintContingencyBackupTicketTransaction &
  DiscardContingencyBackupTicketsTransaction;

interface TicketRow {
  id: string;
  operation: string;
  last_device_seq: number;
  sealed: 0 | 1;
  sale_receipt_printed: 0 | 1 | null;
  void_credit_note_printed: 0 | 1 | null;
  return_credit_note_printed: 0 | 1 | null;
  printed_at: string | null;
  discarded_at: string | null;
}

interface AcknowledgedRow {
  first_unacknowledged_seq: number | null;
  last_device_seq: number;
}

const TICKET_COLUMNS = `
  SELECT tickets.id AS id, tickets.operation AS operation,
         tickets.last_device_seq AS last_device_seq,
         (tickets.qr_codes IS NOT NULL) AS sealed,
         (SELECT sales.printed_at IS NOT NULL FROM sales WHERE sales.id = tickets.subject_id)
           AS sale_receipt_printed,
         (SELECT COALESCE(
             (SELECT credit_note_prints.printed_at IS NOT NULL FROM credit_note_prints
               JOIN sale_credit_notes AS voided_notes
                 ON voided_notes.id = credit_note_prints.credit_note_id
               WHERE voided_notes.sale_id = tickets.subject_id AND voided_notes.return_id IS NULL),
             0
           )
           WHERE EXISTS (
             SELECT 1 FROM sale_credit_notes
              WHERE sale_credit_notes.sale_id = tickets.subject_id
                AND sale_credit_notes.return_id IS NULL
                AND sale_credit_notes.state IN ('AUTHORIZED', 'ISSUED_OFFLINE')
           )
         ) AS void_credit_note_printed,
         (SELECT COALESCE(
             (SELECT credit_note_prints.printed_at IS NOT NULL FROM credit_note_prints
               JOIN sale_credit_notes AS returned_notes
                 ON returned_notes.id = credit_note_prints.credit_note_id
               WHERE returned_notes.return_id = tickets.subject_id),
             0
           )
           WHERE EXISTS (
             SELECT 1 FROM sale_credit_notes
              WHERE sale_credit_notes.return_id = tickets.subject_id
                AND sale_credit_notes.state IN ('AUTHORIZED', 'ISSUED_OFFLINE')
           )
         ) AS return_credit_note_printed,
         tickets.printed_at AS printed_at, tickets.discarded_at AS discarded_at
    FROM contingency_backup_tickets AS tickets`;

function printedOf(value: 0 | 1 | null): boolean | null {
  return value === null ? null : value === 1;
}

function operationOf(row: TicketRow): ContingencyBackupOperation {
  const operation = CONTINGENCY_BACKUP_OPERATIONS.find((known) => known === row.operation);
  if (operation === undefined) {
    throw new Error(`contingency backup ticket ${row.id} has an unknown operation`);
  }
  return operation;
}

function recordOf(row: TicketRow): ContingencyBackupTicketRecord {
  return {
    id: row.id,
    lastDeviceSeq: row.last_device_seq,
    sealed: row.sealed === 1,
    customerDocumentPrinted: customerDocumentPrinted(operationOf(row), {
      saleReceipt: printedOf(row.sale_receipt_printed),
      voidCreditNote: printedOf(row.void_credit_note_printed),
      returnCreditNote: printedOf(row.return_credit_note_printed),
    }),
    printedAt: row.printed_at === null ? null : new Date(row.printed_at),
    discardedAt: row.discarded_at === null ? null : new Date(row.discarded_at),
  };
}

export class SqliteContingencyBackupTickets
  implements ContingencyBackupTicketStore<ContingencyBackupTicketsTransaction>
{
  private readonly database: LocalDatabase;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  transaction<TOutcome>(
    work: (tx: ContingencyBackupTicketsTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const outcome = this.queue.then(() => this.runTransaction(work));
    this.queue = outcome.catch(() => undefined);
    return outcome;
  }

  private async runTransaction<TOutcome>(
    work: (tx: ContingencyBackupTicketsTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const outcome = await work(this.scope());
      this.database.exec("COMMIT");
      return outcome;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async ticketOfSubject(subjectId: string): Promise<ContingencyBackupTicketRecord | undefined> {
    const row = this.database
      .prepare<[string], TicketRow>(
        `${TICKET_COLUMNS}
          WHERE tickets.subject_id = ?
          ORDER BY tickets.created_at DESC, tickets.id DESC
          LIMIT 1`,
      )
      .get(subjectId);
    return row === undefined ? undefined : recordOf(row);
  }

  private scope(): ContingencyBackupTicketsTransaction {
    const database = this.database;
    return {
      async recordTicket(ticket: NewContingencyBackupTicket) {
        database
          .prepare(
            `INSERT INTO contingency_backup_tickets (
               id, operation, subject_id, first_device_seq, last_device_seq, created_at,
               key_version, qr_codes
             ) VALUES (
               @id, @operation, @subject_id, @first_device_seq, @last_device_seq, @created_at,
               @key_version, @qr_codes
             )`,
          )
          .run({
            id: ticket.id,
            operation: ticket.operation,
            subject_id: ticket.subjectId,
            first_device_seq: ticket.range.firstDeviceSeq,
            last_device_seq: ticket.range.lastDeviceSeq,
            created_at: ticket.createdAt.toISOString(),
            key_version: ticket.sealed?.keyVersion ?? null,
            qr_codes: ticket.sealed === null ? null : JSON.stringify(ticket.sealed.qrCodes),
          });
      },
      async ticketsToConsider() {
        return database
          .prepare<[], TicketRow>(
            `${TICKET_COLUMNS}
              WHERE tickets.discarded_at IS NULL
              ORDER BY tickets.created_at, tickets.id`,
          )
          .all()
          .map(recordOf);
      },
      async acknowledgedThroughSeq() {
        const row = database
          .prepare<[], AcknowledgedRow>(
            `SELECT (SELECT MIN(device_seq) FROM outbox
                      WHERE device_id = sync_state.device_id AND acked_at IS NULL)
                      AS first_unacknowledged_seq,
                    last_device_seq
               FROM sync_state`,
          )
          .get();
        if (row === undefined) return 0;
        return row.first_unacknowledged_seq === null
          ? row.last_device_seq
          : row.first_unacknowledged_seq - 1;
      },
      async markPrinted(ticketId, at) {
        database
          .prepare("UPDATE contingency_backup_tickets SET printed_at = ? WHERE id = ?")
          .run(at.toISOString(), ticketId);
      },
      async markDiscarded(ticketIds, at) {
        const mark = database.prepare(
          "UPDATE contingency_backup_tickets SET discarded_at = ? WHERE id = ?",
        );
        for (const ticketId of ticketIds) mark.run(at.toISOString(), ticketId);
      },
    };
  }
}
