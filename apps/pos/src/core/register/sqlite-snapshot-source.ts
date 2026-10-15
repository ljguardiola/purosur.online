import type { LocalDatabase } from "../platform/local-database";

export function readOwnRegisterId(database: LocalDatabase): string | undefined {
  return database.prepare<[], { id: string }>("SELECT id FROM own_register WHERE removed = 0").get()
    ?.id;
}
