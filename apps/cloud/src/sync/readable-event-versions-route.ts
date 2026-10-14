import type { FastifyInstance } from "fastify";

export interface ReadableEventVersionsRouteOptions {
  releaseCheckToken: string | undefined;
}

export function registerReadableEventVersionsRoute(
  _app: FastifyInstance,
  _options: ReadableEventVersionsRouteOptions,
): void {}
