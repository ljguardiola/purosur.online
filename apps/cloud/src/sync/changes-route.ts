import {
  type ChangesPage,
  changesPageSchema,
  changesQuerySchema,
  cloudError,
  cloudErrorStatus,
} from "@purosur/contracts";
import { type PullPage, pullChanges } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { PUBLIC_ACCESS } from "../access/route-access.js";
import { toBranchSettingsWire } from "../branch/branch-settings-wire.js";
import { toIssuerIdentificationWire } from "../fiscal/issuer-identification-read-route.js";
import { registerInstallations, registers } from "../platform/db/schema.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../register/installation-token-ports.js";
import { DrizzleChangeLog } from "./drizzle-change-log.js";
import type { PulledCloudChange } from "./pulled-changes.js";

export type ChangesRouteOptions<TQueryResult extends PgQueryResultHKT> =
  DeviceTokensOptions<TQueryResult>;

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);

function toChangeWire(change: PulledCloudChange): ChangesPage["changes"][number] {
  const { changeSeq: change_seq, entityId: entity_id } = change;
  switch (change.entity) {
    case "branch_settings":
      return {
        change_seq,
        entity: change.entity,
        entity_id,
        row: toBranchSettingsWire(change.row),
      };
    case "category":
      return {
        change_seq,
        entity: change.entity,
        entity_id,
        row: {
          name: change.row.name,
          parent_id: change.row.parentId,
          version: change.row.version,
        },
      };
    case "product":
      return {
        change_seq,
        entity: change.entity,
        entity_id,
        row: {
          name: change.row.name,
          category_id: change.row.categoryId,
          brand_id: change.row.brandId,
          sale_unit: change.row.saleUnit,
          active: change.row.active,
          net_content: change.row.netContent,
          barcodes: change.row.barcodes,
          tag_ids: change.row.tagIds,
          version: change.row.version,
        },
      };
    case "tag":
      return { change_seq, entity: change.entity, entity_id, row: change.row };
    case "price_list":
      return { change_seq, entity: change.entity, entity_id, row: change.row };
    case "price":
      return {
        change_seq,
        entity: change.entity,
        entity_id,
        row: {
          product_id: change.row.productId,
          price_list_id: change.row.priceListId,
          unit_price: change.row.unitPrice,
          valid_from: change.row.validFrom.toISOString(),
          version: change.row.version,
        },
      };
    case "user":
      return {
        change_seq,
        entity: change.entity,
        entity_id,
        row: {
          first_name: change.row.firstName,
          role_id: change.row.roleId,
          salt: change.row.salt,
          pin_hash: change.row.pinHash,
          active: change.row.active,
          version: change.row.version,
        },
      };
    case "role":
      return {
        change_seq,
        entity: change.entity,
        entity_id,
        row: {
          name: change.row.name,
          is_administrator: change.row.isAdministrator,
          permission_keys: change.row.permissionKeys,
          version: change.row.version,
        },
      };
    case "register":
      return { change_seq, entity: change.entity, entity_id, row: change.row };
    case "register_point_of_sale":
      return {
        change_seq,
        entity: change.entity,
        entity_id,
        row: {
          point_of_sale_number: change.row.pointOfSaleNumber,
          fiscal_address_id: change.row.fiscalAddressId,
          version: change.row.version,
        },
      };
    case "discount":
      return {
        change_seq,
        entity: change.entity,
        entity_id,
        row: {
          name: change.row.name,
          benefit: change.row.benefit,
          target: change.row.target,
          valid_from: change.row.validFrom,
          valid_to: change.row.validTo,
          weekdays: change.row.weekdays,
          active: change.row.active,
          version: change.row.version,
        },
      };
    case "issuer_identification":
      return {
        change_seq,
        entity: change.entity,
        entity_id,
        row: toIssuerIdentificationWire(change.row),
      };
    case "buyer_identification_threshold":
      return {
        change_seq,
        entity: change.entity,
        entity_id,
        row: { amount: change.row.amount, valid_from: change.row.validFrom },
      };
    case "buyer_tax_status_set":
      return {
        change_seq,
        entity: change.entity,
        entity_id,
        row: {
          params_version: change.row.paramsVersion,
          options: change.row.options.map(({ code, description, invoiceClass }) => ({
            code,
            description,
            invoice_class: invoiceClass,
          })),
        },
      };
    case "removal":
      return {
        change_seq,
        entity: change.entity,
        entity_id,
        removed_entity: change.removedEntity,
        version: change.version,
      };
  }
}

function toChangesPageWire(page: PullPage<PulledCloudChange>): ChangesPage {
  return {
    changes: page.changes.map(toChangeWire),
    cursor: page.cursor,
    has_more: page.hasMore,
  };
}

// Public to the backoffice's session guard: the device token is this route's own authentication.
export function registerChangesRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ChangesRouteOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const ports = {
    changeLog: new DrizzleChangeLog(options.db),
    clock: { now: options.now ?? (() => new Date()) },
  };

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.get("/changes", { config: { access: PUBLIC_ACCESS } }, async (request, reply) => {
      const authentication = await authenticateDevice(tokenPorts, request.headers.authorization);
      if (authentication.kind !== "installation" || authentication.installation.revoked) {
        await reply
          .code(cloudErrorStatus(DEVICE_TOKEN_REJECTED.code))
          .header("WWW-Authenticate", "Bearer")
          .send(DEVICE_TOKEN_REJECTED);
        return;
      }

      const query = await readValidatedBody(reply, changesQuerySchema, request.query);
      if (!query) {
        return;
      }

      const { deviceId } = authentication.installation;
      const [installation] = await options.db
        .select({ registerId: registers.id, locationId: registers.locationId })
        .from(registerInstallations)
        .innerJoin(registers, eq(registers.id, registerInstallations.registerId))
        .where(eq(registerInstallations.id, deviceId));
      if (!installation) {
        throw new Error("an authenticated installation has no register");
      }

      const page = await pullChanges(ports, {
        deviceId,
        locationId: installation.locationId,
        registerId: installation.registerId,
        since: query.since,
      });
      await reply.code(200).send(changesPageSchema.parse(toChangesPageWire(page)));
    });
  });
}
