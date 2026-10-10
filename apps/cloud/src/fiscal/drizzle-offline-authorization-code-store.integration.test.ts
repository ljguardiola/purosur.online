import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";

const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const OCTOBER_SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("offline_authorization_code_store");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function storeOn(connection: postgres.Sql) {
  return new DrizzleOfflineAuthorizationCodeStore(drizzle(connection));
}

async function onOwnConnection<TOutcome>(
  use: (store: ReturnType<typeof storeOn>) => Promise<TOutcome>,
): Promise<TOutcome> {
  const connection = postgres(integrationDb.databaseUrl, { max: 1 });
  try {
    return await use(storeOn(connection));
  } finally {
    await connection.end({ timeout: 1 });
  }
}

function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

describe("the offline authorization code store on a real Postgres", () => {
  it("makes a second acquisition of the same fortnight wait until the first one finishes", async () => {
    const events: string[] = [];
    const firstMayFinish = gate();
    const firstHolds = gate();

    const first = onOwnConnection((store) =>
      store.holdAcquisition(OCTOBER_FIRST_HALF, async () => {
        events.push("first started");
        firstHolds.open();
        await firstMayFinish.opened;
        events.push("first finished");
      }),
    );
    await firstHolds.opened;
    const second = onOwnConnection((store) =>
      store.holdAcquisition(OCTOBER_FIRST_HALF, async () => {
        events.push("second started");
      }),
    );
    await waitForLockWaiters(sql, 1);
    firstMayFinish.open();
    await Promise.all([first, second]);

    expect(events).toEqual(["first started", "first finished", "second started"]);
  });

  it("lets an acquisition of another fortnight run while the first one is held", async () => {
    const firstMayFinish = gate();
    const firstHolds = gate();
    const first = onOwnConnection((store) =>
      store.holdAcquisition(OCTOBER_FIRST_HALF, async () => {
        firstHolds.open();
        await firstMayFinish.opened;
      }),
    );
    await firstHolds.opened;

    const otherFortnight = await onOwnConnection((store) =>
      store.holdAcquisition(OCTOBER_SECOND_HALF, async () => "ran"),
    );
    firstMayFinish.open();
    await first;

    expect(otherFortnight).toBe("ran");
  });

  it("lets the next acquisition of the fortnight run once the work failed", async () => {
    await expect(
      onOwnConnection((store) =>
        store.holdAcquisition(OCTOBER_FIRST_HALF, async () => {
          throw new Error("the call to ARCA broke");
        }),
      ),
    ).rejects.toThrow("the call to ARCA broke");

    expect(
      await onOwnConnection((store) =>
        store.holdAcquisition(OCTOBER_FIRST_HALF, async () => "ran"),
      ),
    ).toBe("ran");
  });
});
