import { argentinaInstant } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import type { CloudReachability } from "../sync/cloud-reachability";
import { SqliteAcceptedPushLog } from "../sync/sqlite-accepted-push-log";
import { stopOpeningNewSales } from "../sync/sqlite-local-installation";
import { registerStatusFor } from "./register-status-requests";

const NOW = new Date(argentinaInstant("2026-10-05", "12:00"));
const MINUTE_MS = 60 * 1000;

let database: LocalDatabase;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
});

afterEach(() => {
  database.close();
});

function mondayHours(opensAt: string, closesAt: string) {
  const none: { opens_at: string; closes_at: string }[] = [];
  return JSON.stringify({
    monday_hours: [{ opens_at: opensAt, closes_at: closesAt }],
    tuesday_hours: none,
    wednesday_hours: none,
    thursday_hours: none,
    friday_hours: none,
    saturday_hours: none,
    sunday_hours: none,
  });
}

function holdBranchHours(weeklyHours: string): void {
  database
    .prepare(
      `INSERT INTO branch_settings (
         location_id, address, whatsapp_number, instagram_handle, weekly_hours,
         expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version
       ) VALUES ('location', 'Av. Belgrano 1450', '', '', ?, 30, 30, 15, 1)`,
    )
    .run(weeklyHours);
}

async function acceptedMinutesAgo(minutes: number): Promise<void> {
  await new SqliteAcceptedPushLog(database).recordAcceptedPush(
    new Date(NOW.getTime() - minutes * MINUTE_MS),
  );
}

function status(cloud: CloudReachability = "unknown") {
  return registerStatusFor({ database, cloud: () => cloud, now: () => NOW });
}

describe("the register's status", () => {
  it("holds no condition for a register that sells and has never had a push accepted", () => {
    expect(status()).toEqual({ conditions: [], cloud: "unknown" });
  });

  it("holds sales_denied once the register stopped opening new sales because its event history broke", () => {
    stopOpeningNewSales(database, "event_history_broken", NOW);

    expect(status().conditions).toEqual(["sales_denied"]);
  });

  it("holds neither condition once the cloud revoked the installation", async () => {
    holdBranchHours(mondayHours("09:00", "18:00"));
    await acceptedMinutesAgo(30);
    stopOpeningNewSales(database, "installation_revoked", NOW);

    expect(status().conditions).toEqual([]);
  });

  it("holds register_silent when no push was accepted for 15 minutes of business hours", async () => {
    holdBranchHours(mondayHours("09:00", "18:00"));
    await acceptedMinutesAgo(30);

    expect(status().conditions).toEqual(["register_silent"]);
  });

  it("holds no register_silent while the last accepted push is recent", async () => {
    holdBranchHours(mondayHours("09:00", "18:00"));
    await acceptedMinutesAgo(5);

    expect(status().conditions).toEqual([]);
  });

  it("holds no register_silent outside the branch's hours", async () => {
    holdBranchHours(mondayHours("13:00", "18:00"));
    await acceptedMinutesAgo(300);

    expect(status().conditions).toEqual([]);
  });

  it("holds no register_silent without the branch's hours", async () => {
    await acceptedMinutesAgo(300);

    expect(status().conditions).toEqual([]);
  });

  it("holds both conditions, sales_denied first", async () => {
    holdBranchHours(mondayHours("09:00", "18:00"));
    await acceptedMinutesAgo(30);
    stopOpeningNewSales(database, "event_history_broken", NOW);

    expect(status().conditions).toEqual(["sales_denied", "register_silent"]);
  });

  it("drops register_silent as soon as a push is accepted again", async () => {
    holdBranchHours(mondayHours("09:00", "18:00"));
    await acceptedMinutesAgo(30);
    await acceptedMinutesAgo(0);

    expect(status().conditions).toEqual([]);
  });

  it.each<CloudReachability>(["unknown", "reachable", "unreachable"])(
    "reports the cloud as %s as the holder says at the moment it is asked",
    (cloud) => {
      expect(status(cloud).cloud).toBe(cloud);
    },
  );
});
