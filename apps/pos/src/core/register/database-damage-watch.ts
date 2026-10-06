import {
  type LocalDatabaseHealth,
  reportLocalDatabaseDamage,
} from "@purosur/domain/register/use-cases";
import { isDatabaseDamage } from "../platform/database-damage";

export function watchForDatabaseDamage(deps: {
  health: LocalDatabaseHealth;
  exit: () => void;
}): (error: unknown) => Promise<void> {
  return async (error) => {
    if (!isDatabaseDamage(error)) {
      return;
    }
    await reportLocalDatabaseDamage({ health: deps.health });
    deps.exit();
  };
}
