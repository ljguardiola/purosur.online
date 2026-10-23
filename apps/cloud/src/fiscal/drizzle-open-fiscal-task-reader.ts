import {
  externalBillingObservation,
  type FiscalTaskDocumentType,
  OPEN_FISCAL_TASK_STATE,
} from "@purosur/domain";
import type { OpenAlertStandingReader } from "@purosur/domain/alerts/use-cases";
import type {
  FiscalTaskAlert,
  OpenFiscalTask,
  OpenFiscalTaskReader,
  TaxAuthorityRejection,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { fiscalTasks, registers } from "../platform/db/schema.js";

function externalBillingScope(pointOfSale: number, documentType: string, number: number): string {
  const observation = externalBillingObservation({
    pointOfSale,
    documentType: documentType as FiscalTaskDocumentType,
    number,
  });
  if (!observation.holds) {
    throw new Error("an invoicing outside the register always holds an alert");
  }
  return observation.alert.scope;
}

export class DrizzleOpenFiscalTaskReader<TQueryResult extends PgQueryResultHKT>
  implements OpenFiscalTaskReader
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly alerts: OpenAlertStandingReader;

  constructor(db: PgDatabase<TQueryResult>, alerts: OpenAlertStandingReader) {
    this.db = db;
    this.alerts = alerts;
  }

  async openTasksOfBranch(locationId: string): Promise<OpenFiscalTask[]> {
    const rows = await this.db
      .select({ task: fiscalTasks, registerName: registers.name })
      .from(fiscalTasks)
      .innerJoin(registers, eq(registers.id, fiscalTasks.registerId))
      .where(
        and(eq(registers.locationId, locationId), eq(fiscalTasks.state, OPEN_FISCAL_TASK_STATE)),
      )
      .orderBy(asc(fiscalTasks.createdAt), asc(fiscalTasks.id));
    const externalBillingAlerts = await this.openExternalBillingAlerts(
      rows.flatMap(({ task }) =>
        task.kind === "external_invoicing" &&
        task.pointOfSale !== null &&
        task.documentType !== null &&
        task.number !== null
          ? [externalBillingScope(task.pointOfSale, task.documentType, task.number)]
          : [],
      ),
    );
    return rows.flatMap(({ task, registerName }): OpenFiscalTask[] => {
      const base = {
        id: task.id,
        registerId: task.registerId,
        registerName,
        createdAt: task.createdAt,
      };
      const reason = task.reason as Record<string, unknown>;
      switch (task.kind) {
        case "external_invoicing": {
          const { pointOfSale, documentType, number } = task;
          if (pointOfSale === null || documentType === null || number === null) {
            return [];
          }
          return [
            {
              ...base,
              kind: "external_invoicing",
              pointOfSale,
              documentType: documentType as FiscalTaskDocumentType,
              number,
              voucher: {
                issuedOn: reason["issuedOn"] as string,
                total: reason["total"] as number,
                authorizationCode: reason["authorizationCode"] as string,
              },
              alert:
                externalBillingAlerts.get(
                  externalBillingScope(pointOfSale, documentType, number),
                ) ?? null,
            },
          ];
        }
        case "credit_note_rejected": {
          const { pointOfSale, number, creditNoteId } = task;
          if (pointOfSale === null || number === null || creditNoteId === null) {
            return [];
          }
          return [
            {
              ...base,
              kind: "credit_note_rejected",
              pointOfSale,
              number,
              creditNoteId,
              rejections: reason["rejections"] as TaxAuthorityRejection[],
              alert: null,
            },
          ];
        }
        case "deferred_sale_expired":
          return [
            {
              ...base,
              kind: "deferred_sale_expired",
              saleOccurredAt: new Date(reason["saleOccurredAt"] as string),
              total: reason["total"] as number,
              shortCode: reason["shortCode"] as string,
              alert: null,
            },
          ];
        default:
          return [];
      }
    });
  }

  private async openExternalBillingAlerts(scopes: string[]): Promise<Map<string, FiscalTaskAlert>> {
    const standings = await this.alerts.openAlertsOfScopes("external_billing", scopes);
    return new Map(
      standings.map(({ scope, level, escalatedAt }) => [scope, { level, escalatedAt }]),
    );
  }
}
