import type { SignedInPerson } from "../access/signed-in-person";
import { OpenSessionRail } from "./open-session-rail";
import { SessionEyebrow } from "./session-eyebrow";

export type OpenSessionScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  openedAt: string;
  lock: () => void;
};

export function OpenSessionScreen({
  person,
  registerName,
  openedAt,
  lock,
}: OpenSessionScreenProps) {
  return (
    <div className="flex h-screen w-screen bg-surface">
      <OpenSessionRail
        firstName={person.first_name}
        registerName={registerName}
        lock={lock}
        current="sale"
      />
      <main className="flex flex-1 flex-col gap-1.5 p-8">
        <SessionEyebrow registerName={registerName} openedAt={openedAt} />
        <h1 className="text-display text-text-accent">Venta en curso</h1>
      </main>
    </div>
  );
}
