import { House } from "lucide-react";
import { useState } from "react";
import type { ActionEntry } from "./action-entries";
import { ACTION_ENTRIES, entriesFor } from "./action-entries";
import { NavigationRail } from "./navigation-rail";
import { SignOutModal } from "./sign-out-modal";
import type { SignedInPerson } from "./signed-in-person";

export function NoSessionRail({
  person,
  current,
  signOut,
}: {
  person: SignedInPerson;
  current?: ActionEntry["to"] | undefined;
  signOut: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  return (
    <>
      <NavigationRail
        entries={entriesFor(ACTION_ENTRIES, person.abilities)}
        {...(current === undefined
          ? {}
          : { current, home: { label: "Inicio", icon: House, to: "/" as const } })}
        onSignOut={() => setLeaving(true)}
      />
      <SignOutModal
        open={leaving}
        firstName={person.first_name}
        onClose={() => setLeaving(false)}
        onSignOut={signOut}
      />
    </>
  );
}
