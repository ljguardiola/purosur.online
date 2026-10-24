import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { type BackgroundJobs, databaseOfClient } from "../platform/background-jobs.js";
import {
  processRecoveryRequestJob,
  recordRecoveryLinkSentJob,
} from "./process-recovery-request-job.js";
import type { AccessEmailSender } from "./recovery-email-sender.js";
import { flushClosedRecoveryRejectedAttemptWindows } from "./recovery-rejected-attempt-flush.js";
import { recoveryRequestJobPayloadSchema } from "./recovery-request-job-payload.js";
import { findPinCodeByCode, sendFirstPinCodeEmailJob } from "./send-first-pin-code-email-job.js";

export const RECOVERY_REQUEST_TASK_IDENTIFIER = "recovery-request";
export const RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER = "recovery-rejected-attempt-flush";
export const FIRST_PIN_CODE_EMAIL_TASK_IDENTIFIER = "first-pin-code-email";

const RECOVERY_REJECTED_ATTEMPT_FLUSH_CRONTAB_LINE = `*/5 * * * * ${RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER}`;

export interface AccessEmailJobsInput {
  now: () => Date;
  backofficeOrigin: string;
  emailSender: AccessEmailSender;
}

export interface AccessEmailJobsDeps {
  createDatabase?: (client: PoolClient) => NodePgDatabase<Record<string, never>>;
  processJob?: typeof processRecoveryRequestJob;
  recordLinkSent?: typeof recordRecoveryLinkSentJob;
  flush?: typeof flushClosedRecoveryRejectedAttemptWindows;
  findPinCode?: typeof findPinCodeByCode;
}

export function accessEmailJobs(
  input: AccessEmailJobsInput,
  deps: AccessEmailJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const doProcessJob = deps.processJob ?? processRecoveryRequestJob;
  const doRecordLinkSent = deps.recordLinkSent ?? recordRecoveryLinkSentJob;
  const doFlush = deps.flush ?? flushClosedRecoveryRejectedAttemptWindows;
  const doFindPinCode = deps.findPinCode ?? findPinCodeByCode;
  const { now } = input;

  return {
    taskList: {
      [RECOVERY_REQUEST_TASK_IDENTIFIER]: async (rawPayload, helpers) => {
        const parsed = recoveryRequestJobPayloadSchema.safeParse(rawPayload);
        if (!parsed.success) {
          throw new Error(`${RECOVERY_REQUEST_TASK_IDENTIFIER}: malformed job payload`);
        }
        const payload = parsed.data;
        const result = await helpers.withPgClient((client) =>
          doProcessJob(doCreateDatabase(client), payload, {
            now,
            backofficeOrigin: input.backofficeOrigin,
          }),
        );
        if (result.send) {
          const { email, tokenId } = result.send;
          await input.emailSender.sendRecoveryLink(email);
          await helpers.withPgClient((client) =>
            doRecordLinkSent(doCreateDatabase(client), tokenId, { now }),
          );
        }
      },
      [FIRST_PIN_CODE_EMAIL_TASK_IDENTIFIER]: (payload, helpers) =>
        sendFirstPinCodeEmailJob(payload, {
          emailSender: input.emailSender,
          now,
          findPinCode: (code) =>
            helpers.withPgClient((client) => doFindPinCode(doCreateDatabase(client), code)),
        }),
      [RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient((client) => doFlush(doCreateDatabase(client), { now }));
      },
    },
    crontab: [RECOVERY_REJECTED_ATTEMPT_FLUSH_CRONTAB_LINE],
  };
}
