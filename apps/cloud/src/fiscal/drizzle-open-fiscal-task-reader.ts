import { type FiscalTaskDocumentType, OPEN_FISCAL_TASK_STATE } from "@purosur/domain";
import type {
  OpenFiscalTask,
  OpenFiscalTaskReader,
  TaxAuthorityRejection,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { fiscalTasks, registers } from "../platform/db/schema.js";

export class DrizzleOpenFiscalTaskReader<TQueryResult extends PgQueryResultHKT>
  implements OpenFiscalTaskReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
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
            },
          ];
        }
        case "credit_note_rejected": {
          const { pointOfSale, number, creditNoteId } = task;
          if (pointOfSale === null || creditNoteId === null) {
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
            },
          ];
        default:
          return [];
      }
    });
  }
}
