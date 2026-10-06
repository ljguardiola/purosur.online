import type { RegisterService } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";
import { watchForDatabaseDamage } from "./database-damage-watch";
import type { StartedLocalDatabase } from "./local-database-startup";

interface RegisterServiceOfDatabase {
  database: LocalDatabase | undefined;
  service: RegisterService;
  watchFailure: (error: unknown) => Promise<void>;
  startSync: (schedule: { start: () => void }) => void;
}

export function registerServiceOf(
  started: StartedLocalDatabase | undefined,
  exit: () => void,
): RegisterServiceOfDatabase {
  const service: RegisterService =
    started?.kind === "out_of_service" ? { kind: "out_of_service" } : { kind: "in_service" };
  const watchFailure =
    started?.kind === "ready"
      ? watchForDatabaseDamage({ health: started.health, exit })
      : async () => {};
  return {
    database: started?.kind === "ready" ? started.database : undefined,
    service,
    watchFailure,
    startSync: (schedule) => {
      if (service.kind === "in_service") {
        schedule.start();
      }
    },
  };
}
