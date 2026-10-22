import { externalBillingObservation } from "@purosur/domain";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlertCondition } from "../alerts/open-alert-condition.js";
import { alerts, fiscalTasks, registers } from "../platform/db/schema.js";

export interface FiscalTaskAlert {
  level: "informational" | "warning" | "critical";
  escalatedAt: Date | null;
}

interface OpenFiscalTaskBase {
  id: string;
  registerId: string;
  registerName: string;
  createdAt: Date;
  alert: FiscalTaskAlert | null;
}

export type OpenFiscalTask =
  | (OpenFiscalTaskBase & {
      kind: "external_invoicing";
      pointOfSale: number;
      documentType: string;
      number: number;
      voucher: { issuedOn: string; total: number; authorizationCode: string };
    })
  | (OpenFiscalTaskBase & {
      kind: "credit_note_rejected";
      pointOfSale: number;
      number: number;
      creditNoteId: string;
      rejections: { code: number; message: string }[];
    })
  | (OpenFiscalTaskBase & {
      kind: "deferred_sale_expired";
      saleOccurredAt: string;
      total: number;
      shortCode: string;
    });

function externalBillingScope(pointOfSale: number, documentType: string, number: number): string {
  const observation = externalBillingObservation({
    pointOfSale,
    documentType: documentType as Parameters<typeof externalBillingObservation>[0]["documentType"],
    number,
  });
  if (!observation.holds) {
    throw new Error("an invoicing outside the register always holds an alert");
  }
  return observation.alert.scope;
}

export class DrizzleOpenFiscalTaskReader<TQueryResult extends PgQueryResultHKT> {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async openTasksOfBranch(locationId: string): Promise<OpenFiscalTask[]> {
    const rows = await this.db
      .select({ task: fiscalTasks, registerName: registers.name })
      .from(fiscalTasks)
      .innerJoin(registers, eq(registers.id, fiscalTasks.registerId))
      .where(and(eq(registers.locationId, locationId), eq(fiscalTasks.state, "open")))
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
              documentType,
              number,
              voucher: reason as { issuedOn: string; total: number; authorizationCode: string },
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
              rejections: reason["rejections"] as { code: number; message: string }[],
              alert: null,
            },
          ];
        }
        case "deferred_sale_expired":
          return [
            {
              ...base,
              kind: "deferred_sale_expired",
              saleOccurredAt: reason["saleOccurredAt"] as string,
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
    if (scopes.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({ scope: alerts.scope, level: alerts.level, escalatedAt: alerts.escalatedAt })
      .from(alerts)
      .where(
        and(
          eq(alerts.kind, "external_billing"),
          inArray(alerts.scope, scopes),
          openAlertCondition(),
        ),
      );
    return new Map(rows.map(({ scope, level, escalatedAt }) => [scope, { level, escalatedAt }]));
  }
}
