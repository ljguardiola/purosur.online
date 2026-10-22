import { fiscalTasksSchema } from "@purosur/contracts";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import {
  DrizzleOpenFiscalTaskReader,
  type FiscalTaskAlert,
  type OpenFiscalTask,
} from "./drizzle-open-fiscal-task-reader.js";

export interface FiscalTasksRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

function alertToWire(alert: FiscalTaskAlert | null) {
  return alert === null
    ? null
    : { level: alert.level, escalated_at: alert.escalatedAt?.toISOString() ?? null };
}

function toWire(task: OpenFiscalTask, now: Date) {
  const common = {
    id: task.id,
    register_id: task.registerId,
    register_name: task.registerName,
    created_at: task.createdAt.toISOString(),
    open_for_seconds: Math.max(0, Math.floor((now.getTime() - task.createdAt.getTime()) / 1000)),
    alert: alertToWire(task.alert),
  };
  switch (task.kind) {
    case "external_invoicing":
      return {
        ...common,
        kind: task.kind,
        point_of_sale: task.pointOfSale,
        document_type: task.documentType,
        number: task.number,
        voucher: {
          issued_on: task.voucher.issuedOn,
          total: task.voucher.total,
          authorization_code: task.voucher.authorizationCode,
        },
      };
    case "credit_note_rejected":
      return {
        ...common,
        kind: task.kind,
        point_of_sale: task.pointOfSale,
        number: task.number,
        credit_note_id: task.creditNoteId,
        rejections: task.rejections,
      };
    case "deferred_sale_expired":
      return {
        ...common,
        kind: task.kind,
        sale_occurred_at: task.saleOccurredAt,
        total: task.total,
        short_code: task.shortCode,
      };
  }
}

export function registerFiscalTasksListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: FiscalTasksRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleOpenFiscalTaskReader(options.db);

  app.get(
    "/fiscal/tasks",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("fiscal_information"), sessionSource },
    },
    async (request, reply) => {
      const tasks = await reader.openTasksOfBranch(openSessionOf(request).locationId);
      const asOf = now();
      await reply
        .code(200)
        .send(fiscalTasksSchema.parse({ tasks: tasks.map((task) => toWire(task, asOf)) }));
    },
  );
}
