import { History, House } from "lucide-react";
import { useState } from "react";
import { NavigationRail } from "../shell/navigation-rail";
import { OpenSessionRail } from "../shell/open-session-rail";
import { SignOutModal } from "../shell/sign-out-modal";
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
