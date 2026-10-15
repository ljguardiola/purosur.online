import { WSAA_ALREADY_AUTHENTICATED_RETRY_MS } from "@purosur/domain";
import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../credentials/recovery-email-sender.js";
import { setUpRecovery } from "../server.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  FICTIONAL_RECOVERY_REPLY_TO,
  FICTIONAL_RECOVERY_SENDER,
} from "../test-support/recovery-email.js";
import {
  type ArcaTestCredentials,
  generateArcaTestCredentials,
} from "./test-support/arca-test-credentials.js";
import {
  answers,
  type FakeWsaaServer,
  startFakeWsaaServer,
} from "./test-support/fake-wsaa-server.js";
import { UNREACHABLE_WSFE_ENDPOINT } from "./test-support/fake-wsfe-server.js";
import { WSAA_TOKEN_RENEWAL_TASK_IDENTIFIER } from "./wsaa-token-renewal-task.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const NOW = new Date("2026-10-01T16:00:00.000Z");
const ONE_MINUTE_MS = 60_000;
const ACQUISITION_TASK_IDENTIFIER = "offline-authorization-code-acquisition";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let fakeWsaa: FakeWsaaServer;
let credentials: ArcaTestCredentials;
let scheduledMinute = new Date("2026-10-01T16:00:00.000Z");

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("wsaa_token_renewal_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  fakeWsaa = await startFakeWsaaServer();
  credentials = generateArcaTestCredentials();
}, 60_000);

afterAll(async () => {
  await fakeWsaa.close();
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

type Invoicing = { endpoint: string; cuit: string; certificateFingerprint: string };

function serverEnvironment(invoicing?: Invoicing) {
  return {
    databaseUrl: integrationDb.databaseUrl,
    emailSender: { transport: "log" as const },
    emailFrom: FICTIONAL_RECOVERY_SENDER,
    emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
    backofficeOrigin: "https://staging.purosur.online",
    arcaCertificate: {
      environment: "production",
      notAfter: new Date("2126-09-01T19:42:17Z"),
    },
    arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
    ...(invoicing ? { arcaInvoicing: invoicing } : {}),
    arcaWsaa: {
      endpoint: fakeWsaa.endpoint,
      certificatePem: credentials.certificatePem,
      privateKeyPem: credentials.privateKeyPem,
      certificateFingerprint: credentials.fingerprint,
    },
  };
}

function theScheduledMinuteArrives() {
  vi.setSystemTime(scheduledMinute);
}

async function queuedTasks() {
  return sql`
    select t.identifier
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
  `;
}

async function setUp(now: () => Date = () => NOW, invoicing?: Invoicing) {
  expect(await queuedTasks()).toEqual([]);
  const recovery = await setUpRecovery(serverEnvironment(invoicing), now, {
    emailSender: UNUSED_EMAIL_SENDER,
    schedules: false,
  });
  theScheduledMinuteArrives();
  return recovery;
}

async function pendingRenewals() {
  return sql`
    select 1
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${WSAA_TOKEN_RENEWAL_TASK_IDENTIFIER}
  `;
}

beforeEach(() => {
  scheduledMinute = new Date(scheduledMinute.getTime() + ONE_MINUTE_MS);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(scheduledMinute.getTime() - 1);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the WSAA token renewal the server sets up on a real Postgres", () => {
  it("issues and persists a token on the first run and keeps it, without calling WSAA, on the second", async () => {
    const recovery = await setUp();
    try {
      await recovery.workerUtils.addJob(WSAA_TOKEN_RENEWAL_TASK_IDENTIFIER, {});
      await vi.waitFor(
        async () => {
          expect(await pendingRenewals()).toHaveLength(0);
          expect(
            await sql`select token, sign, certificate_fingerprint from arca_wsaa_tokens where service = 'wsfe'`,
          ).toEqual([
            {
              token: "FICTIONAL-TOKEN-0001",
              sign: "FICTIONAL-SIGN-0001",
              certificate_fingerprint: credentials.fingerprint,
            },
          ]);
        },
        { timeout: 20_000, interval: 100 },
      );
      expect(fakeWsaa.requests).toHaveLength(1);

      await recovery.workerUtils.addJob(WSAA_TOKEN_RENEWAL_TASK_IDENTIFIER, {});
      await vi.waitFor(async () => expect(await pendingRenewals()).toHaveLength(0), {
        timeout: 20_000,
        interval: 100,
      });

      expect(fakeWsaa.requests).toHaveLength(1);
      expect(await sql`select 1 from arca_wsaa_tokens`).toHaveLength(1);
    } finally {
      await recovery.close();
    }
  }, 90_000);

  it("renews the token on its own schedule when the server starts with its schedules", async () => {
    await sql`delete from arca_wsaa_tokens`;
    fakeWsaa.behave(answers("login-cms-issued.xml"));
    const recovery = await setUpRecovery(serverEnvironment(), () => NOW, {
      emailSender: UNUSED_EMAIL_SENDER,
    });
    try {
      theScheduledMinuteArrives();

      await vi.waitFor(
        async () =>
          expect(await sql`select token from arca_wsaa_tokens where service = 'wsfe'`).toEqual([
            { token: "FICTIONAL-TOKEN-0001" },
          ]),
        { timeout: 20_000, interval: 100 },
      );
    } finally {
      await recovery.close();
      await sql`delete from graphile_worker._private_jobs`;
    }
  }, 90_000);

  describe("when ARCA still holds an earlier authentication ticket", () => {
    const heldTicketAlerts = (open: boolean) => sql`
      select scope from alerts
      where kind = 'arca_wsaa_ticket_held' and (resolved_at is null) = ${open}`;

    async function runRenewal(recovery: Awaited<ReturnType<typeof setUp>>) {
      await recovery.workerUtils.addJob(WSAA_TOKEN_RENEWAL_TASK_IDENTIFIER, {});
      await vi.waitFor(async () => expect(await pendingRenewals()).toHaveLength(0), {
        timeout: 20_000,
        interval: 100,
      });
    }

    beforeEach(async () => {
      await sql`delete from arca_wsaa_tokens`;
      await sql`delete from arca_wsaa_ticket_refusals`;
      await sql`delete from alerts where kind = 'arca_wsaa_ticket_held'`;
      fakeWsaa.requests.length = 0;
      fakeWsaa.behave(answers("already-authenticated-fault.xml", 500));
    });

    it("opens the alert on the refusal, waits the retry interval, then records the ticket and resolves the alert", async () => {
      let current = NOW;
      const recovery = await setUp(() => current);
      try {
        await runRenewal(recovery);

        expect(fakeWsaa.requests).toHaveLength(1);
        expect(await heldTicketAlerts(true)).toEqual([{ scope: "production" }]);
        expect(await sql`select refused_at from arca_wsaa_ticket_refusals`).toEqual([
          { refused_at: NOW },
        ]);
        expect(await sql`select 1 from arca_wsaa_tokens`).toHaveLength(0);

        current = new Date(NOW.getTime() + WSAA_ALREADY_AUTHENTICATED_RETRY_MS - 1);
        await runRenewal(recovery);

        expect(fakeWsaa.requests).toHaveLength(1);
        expect(await heldTicketAlerts(true)).toHaveLength(1);

        current = new Date(NOW.getTime() + WSAA_ALREADY_AUTHENTICATED_RETRY_MS);
        fakeWsaa.behave(answers("login-cms-issued.xml"));
        await runRenewal(recovery);

        expect(fakeWsaa.requests).toHaveLength(2);
        expect(await sql`select token from arca_wsaa_tokens`).toEqual([
          { token: "FICTIONAL-TOKEN-0001" },
        ]);
        expect(await heldTicketAlerts(true)).toEqual([]);
        expect(await heldTicketAlerts(false)).toEqual([{ scope: "production" }]);
        expect(await sql`select 1 from arca_wsaa_ticket_refusals`).toHaveLength(0);
      } finally {
        await recovery.close();
      }
    }, 90_000);

    it("keeps refusing quietly, with one alert, while ARCA keeps the ticket", async () => {
      let current = NOW;
      const recovery = await setUp(() => current);
      try {
        await runRenewal(recovery);
        current = new Date(NOW.getTime() + WSAA_ALREADY_AUTHENTICATED_RETRY_MS);
        await runRenewal(recovery);

        expect(fakeWsaa.requests).toHaveLength(2);
        expect(await heldTicketAlerts(true)).toHaveLength(1);
        expect(await sql`select refused_at from arca_wsaa_ticket_refusals`).toEqual([
          { refused_at: current },
        ]);
      } finally {
        await recovery.close();
      }
    }, 90_000);

    it("opens no alert when WSAA fails for any other reason", async () => {
      fakeWsaa.behave(answers("certificate-expired-fault.xml", 500));
      const recovery = await setUp();
      try {
        await runRenewal(recovery);

        expect(fakeWsaa.requests).toHaveLength(1);
        expect(await heldTicketAlerts(true)).toEqual([]);
        expect(await sql`select 1 from arca_wsaa_ticket_refusals`).toHaveLength(0);
      } finally {
        await recovery.close();
      }
    }, 90_000);

    describe("the work that waits on a ticket", () => {
      const invoicing = () => ({
        endpoint: UNREACHABLE_WSFE_ENDPOINT,
        cuit: FICTIONAL_CERTIFICATE_CUIT,
        certificateFingerprint: credentials.fingerprint,
      });

      async function recordJobsAdded() {
        const admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
        try {
          await admin`create table if not exists added_jobs (task text not null, job_key text, job_id bigint not null, revision int not null)`;
          await admin`grant all on added_jobs to cloud_app`;
          await admin`delete from added_jobs`;
          await admin.unsafe(`
            create or replace function record_added_job() returns trigger language plpgsql as $body$
            begin
              insert into added_jobs
              select identifier, new.key, new.id, new.revision from graphile_worker._private_tasks where id = new.task_id;
              return new;
            end $body$`);
          await admin`drop trigger if exists record_added_job on graphile_worker._private_jobs`;
          await admin`
            create trigger record_added_job after insert or update on graphile_worker._private_jobs
            for each row execute function record_added_job()`;
        } finally {
          await admin.end({ timeout: 1 });
        }
      }

      async function acquisitionsAddedByTheTicket() {
        return sql`select distinct job_id, revision from added_jobs where task = ${ACQUISITION_TASK_IDENTIFIER} and job_key = ${ACQUISITION_TASK_IDENTIFIER}`;
      }

      it("is asked to run again once the ticket is recorded when the cloud issues documents", async () => {
        let current = NOW;
        const recovery = await setUp(() => current, invoicing());
        try {
          await runRenewal(recovery);
          await recordJobsAdded();
          current = new Date(NOW.getTime() + WSAA_ALREADY_AUTHENTICATED_RETRY_MS);
          fakeWsaa.behave(answers("login-cms-issued.xml"));
          await runRenewal(recovery);

          expect(await acquisitionsAddedByTheTicket()).toHaveLength(1);
        } finally {
          await recovery.close();
        }
      }, 90_000);

      it("is left alone when the cloud does not issue documents", async () => {
        let current = NOW;
        const recovery = await setUp(() => current);
        try {
          await runRenewal(recovery);
          await recordJobsAdded();
          current = new Date(NOW.getTime() + WSAA_ALREADY_AUTHENTICATED_RETRY_MS);
          fakeWsaa.behave(answers("login-cms-issued.xml"));
          await runRenewal(recovery);

          expect(await acquisitionsAddedByTheTicket()).toHaveLength(0);
        } finally {
          await recovery.close();
        }
      }, 90_000);
    });
  });
});
