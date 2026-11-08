import { registerSyncStatusListSchema } from "@purosur/contracts";
import { isBatteryWorn } from "@purosur/domain";
import type { RegisterBatteryState } from "@purosur/domain/installation/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleBranchRegisterSyncReader } from "./drizzle-branch-register-sync-reader.js";

export interface RegisterSyncStatusRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

function batteryWire(battery: RegisterBatteryState | null) {
  if (battery === null || !battery.present) {
    return battery;
  }
  return {
    present: true,
    charge_percent: battery.chargePercent,
    on_battery: battery.onBattery,
    on_battery_minutes: battery.onBatteryMinutes,
    ...(battery.healthPercent === null ? {} : { health_percent: battery.healthPercent }),
    worn: battery.healthPercent !== null && isBatteryWorn(battery.healthPercent),
  };
}

export function registerRegisterSyncStatusRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegisterSyncStatusRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleBranchRegisterSyncReader(options.db);

  app.get(
    "/registers/sync-status",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const { locationId } = openSessionOf(request);
      const registers = await reader.lastSuccessfulSyncOfBranchRegisters(locationId);
      await reply.code(200).send(
        registerSyncStatusListSchema.parse(
          registers.map((register) => ({
            id: register.id,
            name: register.name,
            last_successful_sync_at: register.lastSuccessfulSyncAt?.toISOString() ?? null,
            battery: batteryWire(register.battery),
            disk: register.disk && {
              free_bytes: register.disk.freeBytes,
              free_ratio: register.disk.freeRatio,
            },
          })),
        ),
      );
    },
  );
}
