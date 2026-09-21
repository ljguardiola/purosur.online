import * as Sentry from "@sentry/node";
import { scrubSentryEvent } from "./sentry-scrubbing.js";

export interface SentryEnv {
  dsn?: string | undefined;
  environment?: string | undefined;
}

export interface InitSentryDeps {
  init?: typeof Sentry.init;
}

/**
 * Initializes Sentry error reporting. A no-op when no DSN is configured, so a local or PR
 * environment with no DSN secret never tries to report anywhere.
 */
export function initSentry(env: SentryEnv, deps: InitSentryDeps = {}): void {
  if (!env.dsn) {
    return;
  }

  const init = deps.init ?? Sentry.init;
  init({
    dsn: env.dsn,
    environment: env.environment,
    beforeSend: scrubSentryEvent,
  });
}
