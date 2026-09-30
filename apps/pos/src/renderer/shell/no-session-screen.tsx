import { useState } from "react";
import type { SignedInPerson } from "../access/signed-in-person";
import type { ActionEntry } from "./action-entries";
import { entriesFor } from "./action-entries";
import { NavigationRail } from "./navigation-rail";
import { SessionEyebrow } from "./session-eyebrow";
import { SignOutModal } from "./sign-out-modal";

export type NoSessionScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  entries: readonly ActionEntry[];
  signOut: () => void;
};

export function NoSessionScreen({ person, registerName, entries, signOut }: NoSessionScreenProps) {
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="flex h-screen w-screen bg-surface">
      <NavigationRail
        firstName={person.first_name}
        entries={entriesFor(entries, person.permission_keys)}
        onSignOut={() => setLeaving(true)}
      />
      <main className="flex flex-1 flex-col gap-1.5 p-8">
        <SessionEyebrow registerName={registerName} />
        <h1 className="text-display text-text-accent">¿Qué querés hacer?</h1>
      </main>
      <SignOutModal
        open={leaving}
        firstName={person.first_name}
        onClose={() => setLeaving(false)}
        onSignOut={signOut}
      />
    </div>
  );
}
