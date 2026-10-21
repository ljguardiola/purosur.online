import {
  cloudError,
  cloudErrorStatus,
  registerResetRequestSchema,
  registerResetResponseSchema,
} from "@purosur/contracts";
import { serveRestoredRegisterCreditNoteAnswers } from "@purosur/domain/fiscal/use-cases";
import { admitRestoredRegisterReplenishment } from "@purosur/domain/register/use-cases";
import { serveRestoredRegisterReplenishment } from "@purosur/domain/sync/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { DrizzleRestoredRegisterCreditNoteAnswers } from "../fiscal/drizzle-restored-register-credit-note-answers.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import { DrizzleRestoredRegisterPredecessors } from "../register/drizzle-restored-register-predecessors.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../register/installation-token-ports.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { DrizzleRegisterBranchUsers } from "../users/drizzle-register-branch-users.js";
import { DrizzleRegisterReplenishment } from "./drizzle-register-replenishment.js";

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);
const PREDECESSOR_NOT_OF_REGISTER = cloudError(
  "predecessor_not_of_register",
  "the predecessor installation does not belong to this register",
);
const CURSOR_NOT_OF_REPLENISHMENT = cloudError(
  "cursor_not_of_replenishment",
  "the cursor names an installation that is not part of this replenishment",
);
const PREDECESSOR_NOT_REVOKED = cloudError(
  "predecessor_not_revoked",
  "the predecessor installation is not revoked",
);

export function registerDeviceResetRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: DeviceTokensOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const admission = { predecessors: new DrizzleRestoredRegisterPredecessors(options.db) };
  const ports = { replenishment: new DrizzleRegisterReplenishment(options.db) };
  const creditNotes = new DrizzleRestoredRegisterCreditNoteAnswers(options.db);
  const branchUsers = new DrizzleRegisterBranchUsers(options.db);

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.post(
      "/devices/current/reset",
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
        const body = await readValidatedBody(reply, registerResetRequestSchema, request.body);
        if (!body) {
          return;
        }

        const { registerId } = authentication.installation;
        const admitted = await admitRestoredRegisterReplenishment(admission, {
          registerId,
          predecessorDeviceId: body.predecessor_device_id,
          ...(body.after && { cursorDeviceId: body.after.device_id }),
        });

        switch (admitted.kind) {
          case "predecessor_not_of_register":
            await reply
              .code(cloudErrorStatus(PREDECESSOR_NOT_OF_REGISTER.code))
              .send(PREDECESSOR_NOT_OF_REGISTER);
            return;
          case "predecessor_not_revoked":
            await reply
              .code(cloudErrorStatus(PREDECESSOR_NOT_REVOKED.code))
              .send(PREDECESSOR_NOT_REVOKED);
            return;
          case "cursor_not_of_replenishment":
            await reply
              .code(cloudErrorStatus(CURSOR_NOT_OF_REPLENISHMENT.code))
              .send(CURSOR_NOT_OF_REPLENISHMENT);
            return;
          case "admitted":
            break;
        }

        const page = await serveRestoredRegisterReplenishment(ports, {
          registerId,
          predecessorDeviceId: body.predecessor_device_id,
          lastAcknowledgedSeq: body.last_acknowledged_seq,
          ...(body.after && {
            after: { deviceId: body.after.device_id, deviceSeq: body.after.device_seq },
          }),
        });
        const creditNoteAnswers = await serveRestoredRegisterCreditNoteAnswers(
          { creditNotes },
          { registerId, saleIds: page.voidedSaleIds },
        );
        const users = await branchUsers.branchUsers(registerId);

        await reply.code(200).send(
          registerResetResponseSchema.parse({
            events: page.events.map(({ deviceId, event }) => ({
              ...event,
              device_id: deviceId,
            })),
            next: page.next && {
              device_id: page.next.deviceId,
              device_seq: page.next.deviceSeq,
            },
            users: users.map((user) => ({
              user_id: user.userId,
              first_name: user.firstName,
              role_id: user.roleId,
              salt: user.salt,
              pin_hash: user.pinHash,
              active: user.active,
              version: user.version,
            })),
            credit_notes: creditNoteAnswers.map(({ creditNoteId, answeredAt, answer }) => {
              const common = {
                credit_note_id: creditNoteId,
                answered_at: answeredAt.toISOString(),
              };
              return answer.kind === "authorized"
                ? {
                    ...common,
                    state: "AUTHORIZED" as const,
                    point_of_sale: answer.pointOfSale,
                    number: answer.number,
                    issued_on: answer.issuedOn,
                    issued_at: answer.issuedAt.toISOString(),
                    authorization_code: answer.authorizationCode,
                    authorization_code_due_on: answer.authorizationCodeDueOn,
                  }
                : { ...common, state: "REJECTED" as const };
            }),
          }),
        );
      },
    );
  });
}
