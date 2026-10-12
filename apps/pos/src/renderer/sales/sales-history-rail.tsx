import { NoSessionRail } from "../shell/no-session-rail";
import { OpenSessionRail } from "../shell/open-session-rail";
import type { SignedInPerson } from "../shell/signed-in-person";

export type SalesHistoryRailProps = {
  person: SignedInPerson;
  registerName: string | null;
  sessionOpen: boolean;
  lock: () => void;
};

export function SalesHistoryRail({
  person,
  registerName,
  sessionOpen,
  lock,
}: SalesHistoryRailProps) {
  if (sessionOpen) {
    return (
      <OpenSessionRail
        registerName={registerName}
        lock={lock}
        current="history"
        abilities={person.abilities}
      />
    );
  }
  return <NoSessionRail person={person} current="/history" signOut={lock} />;
}
