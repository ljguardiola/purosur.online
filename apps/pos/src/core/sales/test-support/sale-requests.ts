import { restorePendingIn } from "../../backups/restore-pending";
import { seedChargeRegister } from "../../payments/test-support/mercado-pago-charge-requests";
import type { LocalDatabase } from "../../platform/local-database";
import { LOCAL_MIGRATIONS } from "../../platform/local-migrations";
import { fixedZoneRulesSource } from "../../platform/test-support/fixed-zone-rules-source";
import { migrationClock } from "../../platform/test-support/migration-clock";
import { openLocalDatabase } from "../../platform/test-support/open-local-database";
import { SqliteRestorationEvidence } from "../../register/sqlite-restoration-evidence";
import { createActionGate } from "../../sessions/action-gate";
import { createSignedInPerson } from "../../sessions/signed-in-person";
import { SqliteSignInStore } from "../../sessions/sqlite-sign-in-store";
import type { OutboxSaleRequestDeps, SellingRequestDeps } from "../sale-requests";

export const SALE_REQUESTS_NOW = new Date("2026-10-09T12:00:00.000Z");
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

export function openSellingRegister(): LocalDatabase {
  const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  seedChargeRegister(database);
  return database;
}

export function countingIds(): OutboxSaleRequestDeps["ids"] {
  let count = 0;
  return {
    next: () => {
      count += 1;
      return `id-${count}`;
    },
  };
}

export function saleRequestDeps(
  database: LocalDatabase,
  ids: OutboxSaleRequestDeps["ids"] = countingIds(),
): OutboxSaleRequestDeps & SellingRequestDeps {
  const signedInPerson = createSignedInPerson();
  signedInPerson.set("u1");
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => undefined,
      hashPin: async () => "",
      now: () => SALE_REQUESTS_NOW,
    }),
    readOutboxChainKey: async () => CHAIN_KEY,
    now: () => SALE_REQUESTS_NOW,
    ids,
    paidOrderDiscovery: () => "checked",
    newSalesStoppedByDisk: () => false,
    localDatabaseDamaged: () => false,
    newSalesStoppedByBattery: () => false,
    restoration: new SqliteRestorationEvidence(
      database,
      restorePendingIn(undefined),
      () => "unknown",
      () => false,
    ),
    zoneRules: fixedZoneRulesSource(),
  };
}
