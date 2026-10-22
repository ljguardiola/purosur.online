import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { type Durability, nodeDurability } from "../register/durable-files";
import type { RestorePending } from "./restore-pending";

const LIVE_DATABASE_FILE = "register.sqlite";
const JOURNAL_SUFFIXES = ["", "-wal", "-shm"] as const;

export type SetAsideStaleDatabaseOutcome =
  | { kind: "not_asked" }
  | { kind: "nothing_to_set_aside" }
  | { kind: "set_aside"; name: string };

function keptName(now: Date, attempt: number): string {
  const stamp = now.toISOString().replace(/[-:.]/g, "");
  return `register.stale-${stamp}${attempt === 0 ? "" : `-${attempt}`}.sqlite`;
}

export async function setAsideStaleDatabase({
  folder,
  pending,
  now,
  durability = nodeDurability,
}: {
  folder: string;
  pending: RestorePending;
  now: () => Date;
  durability?: Durability;
}): Promise<SetAsideStaleDatabaseOutcome> {
  if (!pending.setsAsideLiveDatabase()) {
    return { kind: "not_asked" };
  }
  const livePath = join(folder, LIVE_DATABASE_FILE);
  const held = JOURNAL_SUFFIXES.filter((suffix) => existsSync(`${livePath}${suffix}`));
  if (held.length === 0) {
    pending.settleSetAside();
    return { kind: "nothing_to_set_aside" };
  }
  const moment = now();
  let attempt = 0;
  while (existsSync(join(folder, keptName(moment, attempt)))) {
    attempt += 1;
  }
  const name = keptName(moment, attempt);
  for (const suffix of held) {
    await rename(`${livePath}${suffix}`, join(folder, `${name}${suffix}`));
  }
  await durability.folder(folder);
  pending.settleSetAside();
  return { kind: "set_aside", name };
}
