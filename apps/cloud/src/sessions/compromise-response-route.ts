import {
  compromiseResponseItemSchema,
  compromiseResponseSessionsAndPasskeysBodySchema,
} from "@purosur/contracts";
import type { PasskeyRemovalRefusal } from "@purosur/domain";
import {
  type CompromiseResponseStepRequest,
  markCompromiseResponseItemDone,
  type RunCompromiseResponseStepOutcome,
  readCurrentCompromiseResponse,
  runCompromiseResponseStep,
  startCompromiseResponse,
} from "@purosur/domain/sessions/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  AUTHORIZATION_REQUIRED_RESPONSE,
  requirePasskeyAuthorization,
} from "../credentials/passkey-authorization-guard.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { compromiseResponseWire } from "./compromise-response-wire.js";
import { DrizzleCompromiseResponseStore } from "./drizzle-compromise-response-store.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";
import { clearSessionCookie } from "./session-cookie.js";

export interface CompromiseResponseRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  keysEncryptionKey: Uint8Array;
  now: () => Date;
}

const NO_RESPONSE_RESPONSE = {
  code: "not_found",
  message: "no compromise-response runbook was started",
} as const;

const NO_RUNNING_RESPONSE_RESPONSE = {
  code: "no_running_response",
  message: "there is no running compromise-response runbook",
} as const;

const OUT_OF_ORDER_RESPONSE = {
  code: "out_of_order",
  message: "an earlier step of the runbook is not done yet",
} as const;

const ALREADY_DONE_RESPONSE = {
  code: "already_done",
  message: "the runbook already has this step or item done",
} as const;

const USER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

const OWN_ACCOUNT_RESPONSE = {
  code: "own_account",
  message: "choose another account than the one running the runbook",
} as const;

const UNKNOWN_ITEM_RESPONSE = {
  code: "validation_failed",
  message: "item must be a checklist item of the runbook",
  details: [{ field: "item" }],
} as const;

async function sendActionRefusal(
  reply: FastifyReply,
  refusal: PasskeyRemovalRefusal,
): Promise<void> {
  switch (refusal) {
    case "authorization_required":
      await reply.code(401).send(AUTHORIZATION_REQUIRED_RESPONSE);
      return;
    case "user_not_found":
      await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
      return;
    case "own_account":
      await reply.code(403).send(OWN_ACCOUNT_RESPONSE);
      return;
  }
}

export function registerCompromiseResponseRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: CompromiseResponseRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const store = new DrizzleCompromiseResponseStore(options.db, options);
  const routeOptions = {
    preHandler: backofficeOriginGuard(options.backofficeOrigin),
    config: { access: capabilityAccess("manage_users"), sessionSource },
  };

  async function sendCurrentResponse(reply: FastifyReply): Promise<void> {
    const current = await readCurrentCompromiseResponse({ responses: store });
    if (current.kind === "none") {
      throw new Error("the runbook that was just changed is gone");
    }
    await reply.code(200).send(compromiseResponseWire(current.response));
  }

  async function sendStepOutcome(
    reply: FastifyReply,
    outcome: RunCompromiseResponseStepOutcome,
  ): Promise<void> {
    switch (outcome.kind) {
      case "no_running_response":
        await reply.code(409).send(NO_RUNNING_RESPONSE_RESPONSE);
        return;
      case "out_of_order":
        await reply.code(409).send(OUT_OF_ORDER_RESPONSE);
        return;
      case "already_done":
        await reply.code(409).send(ALREADY_DONE_RESPONSE);
        return;
      case "action_refused":
        await sendActionRefusal(reply, outcome.refusal);
        return;
      case "done":
        await sendCurrentResponse(reply);
        return;
    }
  }

  async function runStep(
    reply: FastifyReply,
    request: Parameters<typeof openSessionOf>[0],
    step: CompromiseResponseStepRequest,
  ): Promise<RunCompromiseResponseStepOutcome | undefined> {
    const attemptedAt = now();
    const openSession = openSessionOf(request);
    if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
      return undefined;
    }
    return runCompromiseResponseStep(
      { store },
      {
        ...step,
        actorId: openSession.userId,
        locationId: openSession.locationId,
        passkeyAuthorizedAt: openSession.passkeyAuthorizedAt,
        at: attemptedAt,
      },
    );
  }

  app.post("/compromise-responses", routeOptions, async (request, reply) => {
    const outcome = await startCompromiseResponse(
      { store },
      { actorId: openSessionOf(request).userId, at: now() },
    );
    await reply
      .code(outcome.kind === "started" ? 201 : 200)
      .send(compromiseResponseWire(outcome.response));
  });

  app.get("/compromise-responses/current", routeOptions, async (_request, reply) => {
    const current = await readCurrentCompromiseResponse({ responses: store });
    if (current.kind === "none") {
      await reply.code(404).send(NO_RESPONSE_RESPONSE);
      return;
    }
    await reply.code(200).send(compromiseResponseWire(current.response));
  });

  app.post(
    "/compromise-responses/current/steps/revoke-every-installation",
    routeOptions,
    async (request, reply) => {
      const outcome = await runStep(reply, request, { step: "revoke_every_installation" });
      if (outcome) {
        await sendStepOutcome(reply, outcome);
      }
    },
  );

  app.post(
    "/compromise-responses/current/steps/end-sessions-and-remove-passkeys",
    routeOptions,
    async (request, reply) => {
      const body = await readValidatedBody(
        reply,
        compromiseResponseSessionsAndPasskeysBodySchema,
        request.body,
      );
      if (!body) {
        return;
      }
      const outcome = await runStep(reply, request, {
        step: "end_sessions_and_remove_passkeys",
        accountId: body.account_id,
      });
      if (!outcome) {
        return;
      }
      if (outcome.kind === "done") {
        reply.header("Set-Cookie", clearSessionCookie());
      }
      await sendStepOutcome(reply, outcome);
    },
  );

  app.post(
    "/compromise-responses/current/steps/force-pin-resets",
    routeOptions,
    async (request, reply) => {
      const outcome = await runStep(reply, request, { step: "force_pin_resets" });
      if (outcome) {
        await sendStepOutcome(reply, outcome);
      }
    },
  );

  app.post("/compromise-responses/current/items/:item", routeOptions, async (request, reply) => {
    const item = compromiseResponseItemSchema.safeParse(
      (request.params as { item?: unknown }).item,
    );
    if (!item.success) {
      await reply.code(400).send(UNKNOWN_ITEM_RESPONSE);
      return;
    }
    const outcome = await markCompromiseResponseItemDone(
      { store },
      { item: item.data, actorId: openSessionOf(request).userId, at: now() },
    );
    switch (outcome.kind) {
      case "no_running_response":
        await reply.code(409).send(NO_RUNNING_RESPONSE_RESPONSE);
        return;
      case "out_of_order":
        await reply.code(409).send(OUT_OF_ORDER_RESPONSE);
        return;
      case "already_done":
        await reply.code(409).send(ALREADY_DONE_RESPONSE);
        return;
      case "done":
        await sendCurrentResponse(reply);
        return;
    }
  });
}
