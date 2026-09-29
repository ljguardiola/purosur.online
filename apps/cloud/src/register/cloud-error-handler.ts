import { cloudError, cloudErrorStatus } from "@purosur/contracts";
import type { FastifyError, FastifyInstance } from "fastify";

function isClientError(error: FastifyError): boolean {
  return error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500;
}

// Fastify answers a body it can't parse, and any thrown error, before the route's own handler
// can shape it, so the register-to-cloud contract's routes need their own error handler.
export function answerErrorsWithCloudEnvelope(scope: FastifyInstance): void {
  scope.setErrorHandler(async (error: FastifyError, request, reply) => {
    if (!isClientError(error)) {
      request.log.error({ err: error }, "register-to-cloud request failed");
    }
    const envelope = isClientError(error)
      ? cloudError("validation_failed", "the request body could not be read")
      : cloudError("internal_error", "the request could not be completed");
    await reply.code(cloudErrorStatus(envelope.code)).send(envelope);
  });
}
