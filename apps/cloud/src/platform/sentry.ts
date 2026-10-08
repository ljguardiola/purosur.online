import { ERROR_REPORT_DATA_COLLECTION, scrubErrorReport } from "@purosur/contracts";
import * as Sentry from "@sentry/node";

export interface SentryEnv {
  dsn?: string | undefined;
  environment?: string | undefined;
  release?: string | undefined;
}

export interface InitSentryDeps {
  init?: typeof Sentry.init;
}

/** A no-op when no DSN is configured, so a local or preview environment never tries to report anywhere. */
export function initSentry(env: SentryEnv, deps: InitSentryDeps = {}): void {
  if (!env.dsn) {
    return;
  }

  const init = deps.init ?? Sentry.init;
  init({
    dsn: env.dsn,
    environment: env.environment,
    release: env.release,
    dataCollection: ERROR_REPORT_DATA_COLLECTION,
    beforeSend: scrubErrorReport,
  });
}
