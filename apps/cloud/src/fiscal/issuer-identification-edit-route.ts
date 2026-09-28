import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { checkRequestIsSameOrigin } from "../access/open-session.js";
import { requirePasskeyAuthorization } from "../access/passkey-authorization-guard.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import {
  auditLog,
  ISSUER_IDENTIFICATION_SINGLETON_ID,
  issuerIdentification,
} from "../platform/db/schema.js";
import type {
  IssuerIdentificationRouteOptions,
  IssuerIdentificationRow,
} from "./issuer-identification-read-route.js";
import { toIssuerIdentificationWire } from "./issuer-identification-read-route.js";
import {
  type IssuerIdentificationEditInput,
  type IssuerIdentificationFieldValidationFailure,
  readIssuerIdentificationEditBody,
} from "./issuer-identification-validation.js";

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "the issuer identification was changed since it was loaded",
} as const;

function isValidationFailure(
  value: IssuerIdentificationEditInput | IssuerIdentificationFieldValidationFailure,
): value is IssuerIdentificationFieldValidationFailure {
  return "field" in value;
}

export interface EditIssuerIdentificationInput extends IssuerIdentificationEditInput {
  actorId: string;
}

export type EditIssuerIdentificationOutcome =
  | { kind: "stale_version" }
  | { kind: "applied"; row: IssuerIdentificationRow };

export async function editIssuerIdentification<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: EditIssuerIdentificationInput,
): Promise<EditIssuerIdentificationOutcome> {
  return db.transaction<EditIssuerIdentificationOutcome>(async (tx) => {
    // Locks the row so a concurrent save waits instead of racing: the version check and any write
    // below run against a value that can't change out from under this transaction.
    const [current] = await tx
      .select({
        legalName: issuerIdentification.legalName,
        grossIncomeRegistration: issuerIdentification.grossIncomeRegistration,
        activityStartDate: issuerIdentification.activityStartDate,
        version: issuerIdentification.version,
      })
      .from(issuerIdentification)
      .where(eq(issuerIdentification.id, ISSUER_IDENTIFICATION_SINGLETON_ID))
      .for("update");
    if (!current) {
      throw new Error("issuer identification row missing: the seeding migration never ran");
    }
    if (current.version !== input.version) {
      return { kind: "stale_version" };
    }

    const next: Omit<IssuerIdentificationRow, "version"> = {
      legalName: input.legalName,
      grossIncomeRegistration: input.grossIncomeRegistration,
      activityStartDate: input.activityStartDate,
    };
    const unchanged =
      current.legalName === next.legalName &&
      current.grossIncomeRegistration === next.grossIncomeRegistration &&
      current.activityStartDate === next.activityStartDate;

    if (unchanged) {
      return { kind: "applied", row: current };
    }

    const nextVersion = current.version + 1;
    await tx
      .update(issuerIdentification)
      .set({ ...next, version: nextVersion })
      .where(eq(issuerIdentification.id, ISSUER_IDENTIFICATION_SINGLETON_ID));

    await tx.insert(auditLog).values({
      entity: "issuer_identification",
      entityId: ISSUER_IDENTIFICATION_SINGLETON_ID,
      actorId: input.actorId,
      previousValue: toIssuerIdentificationWireForAudit(current),
      newValue: toIssuerIdentificationWireForAudit({ ...next, version: nextVersion }),
    });

    return { kind: "applied", row: { ...next, version: nextVersion } };
  });
}

function toIssuerIdentificationWireForAudit(row: IssuerIdentificationRow) {
  return {
    legal_name: row.legalName,
    gross_income_registration: row.grossIncomeRegistration,
    activity_start_date: row.activityStartDate,
    version: row.version,
  };
}

export function registerIssuerIdentificationEditRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: IssuerIdentificationRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put(
    "/fiscal-configuration/issuer-identification",
    {
      preHandler: originGuard((request, reply) =>
        checkRequestIsSameOrigin(request, reply, options.backofficeOrigin),
      ),
      config: { access: permissionAccess("change_fiscal_configuration"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const parsedBody = readIssuerIdentificationEditBody(request.body, attemptedAt);
      if (isValidationFailure(parsedBody)) {
        await reply.code(400).send({
          code: "validation_failed",
          message: parsedBody.message,
          details: [{ field: parsedBody.field }],
        });
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await editIssuerIdentification(options.db, {
        ...parsedBody,
        actorId: openSession.userId,
      });

      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }

      await reply.code(200).send(toIssuerIdentificationWire(outcome.row, options.authorizedCuit));
    },
  );
}
