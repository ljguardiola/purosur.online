import type { ContingencyBackupTicketRecord } from "@purosur/domain";
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
  last_device_seq: number;
  sealed: 0 | 1;
  customer_document_printed: 0 | 1 | null;
  printed_at: string | null;
  discarded_at: string | null;
}

interface AcknowledgedRow {
  first_unacknowledged_seq: number | null;
  last_device_seq: number;
}

// The customer's own document is the sale's receipt for a sale, and the credit note for the void
// of a sale that has an authorized one; no other operation waits for a document.
const CUSTOMER_DOCUMENT_PRINTED = `
  CASE tickets.operation
    WHEN 'sale' THEN (
      SELECT sales.printed_at IS NOT NULL FROM sales WHERE sales.id = tickets.subject_id
    )
    WHEN 'sale_void' THEN (
      SELECT COALESCE(
        (SELECT credit_note_prints.printed_at IS NOT NULL FROM credit_note_prints
          WHERE credit_note_prints.sale_id = tickets.subject_id),
        0
      )
      WHERE EXISTS (
        SELECT 1 FROM sale_void_credit_notes
         WHERE sale_void_credit_notes.sale_id = tickets.subject_id
           AND sale_void_credit_notes.state = 'AUTHORIZED'
      )
    )
  END`;

const TICKET_COLUMNS = `
  SELECT tickets.id AS id, tickets.last_device_seq AS last_device_seq,
         (tickets.qr_codes IS NOT NULL) AS sealed,
         ${CUSTOMER_DOCUMENT_PRINTED} AS customer_document_printed,
         tickets.printed_at AS printed_at, tickets.discarded_at AS discarded_at
    FROM contingency_backup_tickets AS tickets`;

function recordOf(row: TicketRow): ContingencyBackupTicketRecord {
  return {
    id: row.id,
    lastDeviceSeq: row.last_device_seq,
    sealed: row.sealed === 1,
    customerDocumentPrinted:
      row.customer_document_printed === null ? null : row.customer_document_printed === 1,
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
