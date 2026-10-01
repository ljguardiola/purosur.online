import {
  type BuyerTaxStatusOption,
  type FacturaC,
  type IssuerIdentificationInEffect,
  latestBuyerTaxStatusSet,
  latestIssuerIdentification,
  type OutboxEventDraft,
  type PreEmissionGateFailureReason,
  type PreEmissionGateOutcome,
} from "@purosur/domain";
import type {
  CompletedSale,
  FiscalAuthorizationReader,
  FiscalGateLedger,
  FiscalGateLedgerTransaction,
  RecordedPreEmissionGate,
} from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { appendOutboxEvent } from "../sync/sqlite-outbox";

interface OutcomeRow {
  sale_id: string;
  evaluated_at: string;
  outcome: "PASSED" | "FAILED";
  failure_reason: PreEmissionGateFailureReason | null;
  document: string | null;
}

interface IssuerRow {
  version: number;
  legal_name: string | null;
  gross_income_registration: string | null;
  activity_start_date: string | null;
  authorized_cuit: string;
  tax_status: string;
}

interface BuyerTaxStatusSetRow {
  params_version: number;
  options: string;
}

interface StoredBuyerTaxStatusOption {
  code: number;
  description: string;
  invoice_class: string;
}

function toOutcome(row: OutcomeRow): PreEmissionGateOutcome {
  return row.outcome === "PASSED"
    ? { kind: "passed", document: JSON.parse(row.document as string) as FacturaC }
    : { kind: "failed", reason: row.failure_reason as PreEmissionGateFailureReason };
}

export class SqliteFiscalGateLedger implements FiscalGateLedger, FiscalAuthorizationReader {
  private readonly database: LocalDatabase;
  private readonly outboxChainKey: string | undefined;

  constructor(database: LocalDatabase, outboxChainKey?: string) {
    this.database = database;
    this.outboxChainKey = outboxChainKey;
  }

  transaction<TOutcome>(work: (tx: FiscalGateLedgerTransaction) => TOutcome): TOutcome {
    return this.database.transaction(() => work(this.transactionScope()))();
  }

  latestPreEmissionGateOutcome(): PreEmissionGateOutcome | undefined {
    const row = this.database
      .prepare<[], OutcomeRow>(
        `SELECT sale_id, evaluated_at, outcome, failure_reason, document
         FROM pre_emission_gate_outcomes ORDER BY rowid DESC LIMIT 1`,
      )
      .get();
    return row === undefined ? undefined : toOutcome(row);
  }

  private transactionScope(): FiscalGateLedgerTransaction {
    return {
      completedSale: (saleId) => this.completedSale(saleId),
      recordedPreEmissionGate: (saleId) => this.recordedPreEmissionGate(saleId),
      issuerIdentificationInEffect: () => this.issuerIdentificationInEffect(),
      buyerTaxStatusSetInEffect: () => this.buyerTaxStatusSetInEffect(),
      recordPreEmissionGate: (recorded) => this.recordPreEmissionGate(recorded),
      appendOutboxEvent: (draft) => this.appendOutboxEvent(draft),
    };
  }

  private completedSale(saleId: string): CompletedSale | undefined {
    const sale = this.database
      .prepare<[string], { id: string; register_id: string; actor_id: string }>(
        "SELECT id, register_id, actor_id FROM sales WHERE id = ? AND state = 'COMPLETED'",
      )
      .get(saleId);
    if (sale === undefined) {
      return undefined;
    }
    const lines = this.database
      .prepare<[string], { line_total: number }>(
        "SELECT line_total FROM sale_lines WHERE sale_id = ? ORDER BY position",
      )
      .all(saleId);
    return {
      id: sale.id,
      registerId: sale.register_id,
      actorId: sale.actor_id,
      lines: lines.map((line) => ({ lineTotal: line.line_total })),
    };
  }

  private recordedPreEmissionGate(saleId: string): RecordedPreEmissionGate | undefined {
    const row = this.database
      .prepare<[string], OutcomeRow>(
        `SELECT sale_id, evaluated_at, outcome, failure_reason, document
         FROM pre_emission_gate_outcomes WHERE sale_id = ?`,
      )
      .get(saleId);
    return row === undefined
      ? undefined
      : { saleId: row.sale_id, evaluatedAt: new Date(row.evaluated_at), outcome: toOutcome(row) };
  }

  private issuerIdentificationInEffect(): IssuerIdentificationInEffect | undefined {
    const versions = this.database
      .prepare<[], IssuerRow>(
        `SELECT version, legal_name, gross_income_registration, activity_start_date,
                authorized_cuit, tax_status
         FROM issuer_identification_versions`,
      )
      .all()
      .map((row) => ({
        legalName: row.legal_name,
        grossIncomeRegistration: row.gross_income_registration,
        activityStartDate: row.activity_start_date,
        authorizedCuit: row.authorized_cuit,
        taxStatus: row.tax_status,
        version: row.version,
      }));
    return latestIssuerIdentification(versions);
  }

  private buyerTaxStatusSetInEffect(): readonly BuyerTaxStatusOption[] | undefined {
    const sets = this.database
      .prepare<[], BuyerTaxStatusSetRow>(
        "SELECT params_version, options FROM buyer_tax_status_sets",
      )
      .all()
      .map((row) => ({
        paramsVersion: row.params_version,
        options: (JSON.parse(row.options) as StoredBuyerTaxStatusOption[]).map((option) => ({
          code: option.code,
          description: option.description,
          invoiceClass: option.invoice_class,
        })),
      }));
    return latestBuyerTaxStatusSet(sets)?.options;
  }

  private recordPreEmissionGate({ saleId, evaluatedAt, outcome }: RecordedPreEmissionGate): void {
    this.database
      .prepare(
        `INSERT INTO pre_emission_gate_outcomes (sale_id, evaluated_at, outcome, failure_reason, document)
         VALUES (@sale_id, @evaluated_at, @outcome, @failure_reason, @document)`,
      )
      .run({
        sale_id: saleId,
        evaluated_at: evaluatedAt.toISOString(),
        outcome: outcome.kind === "passed" ? "PASSED" : "FAILED",
        failure_reason: outcome.kind === "failed" ? outcome.reason : null,
        document: outcome.kind === "passed" ? JSON.stringify(outcome.document) : null,
      });
  }

  private appendOutboxEvent(draft: OutboxEventDraft): void {
    if (this.outboxChainKey === undefined) {
      throw new Error("the ledger has no outbox chain key");
    }
    appendOutboxEvent(this.database, this.outboxChainKey, draft);
  }
}
