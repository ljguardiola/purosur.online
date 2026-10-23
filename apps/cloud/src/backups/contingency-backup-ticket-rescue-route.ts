import {
  type ContingencyBackupTicketRescueResponse,
  contingencyBackupTicketRescueRequestSchema,
  contingencyBackupTicketRescueResponseSchema,
} from "@purosur/contracts";
import {
  type RescueContingencyBackupTicketOutcome,
  rescueContingencyBackupTicket,
} from "@purosur/domain/backups/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { installationKeyCipher } from "../register/installation-key-cipher.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleInbox } from "../sync/drizzle-inbox.js";
import {
  type EnqueueEventApplication,
  enqueueEventApplicationJob,
} from "../sync/graphile-event-application-queue.js";
import { DrizzleContingencyBackupTicketOpener } from "./drizzle-contingency-backup-ticket-opener.js";
import { DrizzleRescuedTicketAudit } from "./drizzle-rescued-ticket-audit.js";
import { InboxRescuedTicketEvents } from "./inbox-rescued-ticket-events.js";
import { syncedRescuedEventDecoder } from "./synced-rescued-event-decoder.js";

export interface ContingencyBackupTicketRescueRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  keysEncryptionKey: Uint8Array;
  now: () => Date;
  enqueueEventApplication?: EnqueueEventApplication;
}

function responseOf(
  outcome: RescueContingencyBackupTicketOutcome,
): ContingencyBackupTicketRescueResponse {
  if (outcome.kind !== "rescued") {
    return { outcome: outcome.kind };
  }
  const { summary } = outcome;
  return {
    outcome: "rescued",
    register_id: outcome.registerId,
    register_name: outcome.registerName,
    received: outcome.received,
    already_received: outcome.alreadyReceived,
    summary: {
      operation: summary.operation,
      occurred_at: summary.occurredAt,
      vouchers: summary.vouchers.map((voucher) => ({
        point_of_sale: voucher.pointOfSale,
        document_type: voucher.documentType,
        number: voucher.number,
      })),
      sale_total: summary.saleTotal,
    },
  };
}

export function registerContingencyBackupTicketRescueRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ContingencyBackupTicketRescueRouteOptions<TQueryResult>,
): void {
  const { db, now } = options;
  registerRouteAccess(app);
  const cipher = installationKeyCipher(options.keysEncryptionKey);
  const ports = {
    opener: new DrizzleContingencyBackupTicketOpener(db, cipher),
    events: new InboxRescuedTicketEvents(
      new DrizzleInbox(db, cipher, options.enqueueEventApplication ?? enqueueEventApplicationJob),
      now,
    ),
    decoder: syncedRescuedEventDecoder,
    audit: new DrizzleRescuedTicketAudit(db, now),
  };

  app.post(
    "/contingency-backup-tickets/rescue",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: {
        access: capabilityAccess("contingency_ticket_rescue"),
        sessionSource: routeSessionSource({ db, now }),
      },
    },
    async (request, reply) => {
      const body = await readValidatedBody(
        reply,
        contingencyBackupTicketRescueRequestSchema,
        request.body,
      );
      if (!body) {
        return;
      }

      const outcome = await rescueContingencyBackupTicket(ports, {
        qrCodes: body.qr_codes,
        actorId: openSessionOf(request).userId,
      });
      await reply
        .code(200)
        .send(contingencyBackupTicketRescueResponseSchema.parse(responseOf(outcome)));
    },
  );
}
