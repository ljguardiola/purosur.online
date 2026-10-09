import { History, House } from "lucide-react";
import { useState } from "react";
import { NavigationRail } from "./navigation-rail";
import { OpenSessionRail } from "./open-session-rail";
import { SignOutModal } from "./sign-out-modal";
import type { SignedInPerson } from "./signed-in-person";

export type HistoryRailProps = {
  person: SignedInPerson;
  registerName: string | null;
  sessionOpen: boolean;
  lock: () => void;
};

export function HistoryRail({ person, registerName, sessionOpen, lock }: HistoryRailProps) {
  const [leaving, setLeaving] = useState(false);

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
  return (
    <>
      <NavigationRail
        entries={[]}
        home={{ label: "Inicio", icon: House, to: "/" }}
        links={[{ label: "Historial", icon: History, to: "/history", current: true }]}
        onSignOut={() => setLeaving(true)}
      />
      <SignOutModal
        open={leaving}
        firstName={person.first_name}
        onClose={() => setLeaving(false)}
        onSignOut={lock}
      />
    </>
  );
}
