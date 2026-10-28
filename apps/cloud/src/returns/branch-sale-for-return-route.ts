import {
  type BranchSaleForReturnAnswer,
  branchSaleForReturnAnswerSchema,
  branchSaleForReturnQuerySchema,
  cloudError,
  cloudErrorStatus,
} from "@purosur/contracts";
import { SALE_STATES_AFTER_COMPLETION } from "@purosur/domain";
import type { BranchSaleFacts } from "@purosur/domain/returns/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../register/installation-token-ports.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { DrizzleBranchSaleForReturnReader } from "./drizzle-branch-sale-for-return-reader.js";

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);

function completedSaleState(sale: BranchSaleFacts["sale"]["sale"]) {
  const state = SALE_STATES_AFTER_COMPLETION.find((known) => known === sale.state);
  if (state === undefined) {
    throw new Error(`sale ${sale.id} was read as ${sale.state}, not as a completed sale`);
  }
  return state;
}

function toAnswerWire({
  sale: facts,
  invoiceStanding,
  countedReturnIds,
}: BranchSaleFacts): BranchSaleForReturnAnswer {
  const { sale } = facts;
  return {
    sale: {
      id: sale.id,
      register_id: sale.registerId,
      device_id: sale.deviceId,
      session_id: sale.sessionId,
      actor_id: sale.actorId,
      state: completedSaleState(sale),
      lines: sale.lines.map((line) => ({
        id: line.id,
        product_id: line.productId,
        product_name: line.productName,
        sale_unit: line.saleUnit,
        quantity: line.quantity,
        promotion_id: line.promotionId,
        line_total: line.lineTotal,
      })),
    },
    occurred_at: facts.occurredAt.toISOString(),
    invoice:
      facts.invoice === null
        ? null
        : { point_of_sale: facts.invoice.pointOfSale, number: facts.invoice.number },
    invoice_standing: {
      fiscal_documents: invoiceStanding.fiscalDocuments.map((document) => ({
        origin: document.origin,
        state: document.state,
        point_of_sale: document.pointOfSale,
        number: document.number,
        buyer_tax_status_code: document.buyerTaxStatusCode,
      })),
      deferral_pending: invoiceStanding.deferralPending,
    },
    payments: facts.payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      provider: payment.provider,
      amount: payment.amount,
      state: payment.state,
      refunded_amount: payment.refundedAmount,
    })),
    returned: facts.returned.map((line) => ({
      sale_line_id: line.saleLineId,
      quantity: line.quantity,
      refunded_amount: line.refundedAmount,
    })),
    counted_return_ids: countedReturnIds,
  };
}

// Public to the backoffice's session guard: the device token is this route's own authentication.
export function registerBranchSaleForReturnRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: DeviceTokensOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const reader = new DrizzleBranchSaleForReturnReader(options.db);

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.get(
      "/devices/current/returns/sale",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const authentication = await authenticateDevice(tokenPorts, request.headers.authorization);
        if (authentication.kind !== "installation" || authentication.installation.revoked) {
          await reply
            .code(cloudErrorStatus(DEVICE_TOKEN_REJECTED.code))
            .header("WWW-Authenticate", "Bearer")
            .send(DEVICE_TOKEN_REJECTED);
          return;
        }

        const ticket = await readValidatedBody(
          reply,
          branchSaleForReturnQuerySchema,
          request.query,
        );
        if (!ticket) {
          return;
        }

        const facts = await reader.saleForReturnInBranchOf(
          authentication.installation.registerId,
          ticket,
        );
        if (facts === undefined) {
          await reply
            .code(cloudErrorStatus("not_found"))
            .send(cloudError("not_found", "the branch has no sale for that ticket"));
          return;
        }
        await reply.code(200).send(branchSaleForReturnAnswerSchema.parse(toAnswerWire(facts)));
      },
    );
  });
}
