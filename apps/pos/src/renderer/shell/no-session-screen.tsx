import type { OpenCashSessionOutcome } from "@purosur/contracts";
import { useState } from "react";
import type { ActionEntry } from "./action-entries";
import { entriesFor } from "./action-entries";
import { CashOpeningPanel } from "./cash-opening-panel";
import { NavigationRail } from "./navigation-rail";
import { SessionEyebrow } from "./session-eyebrow";
import { SignOutModal } from "./sign-out-modal";
import type { SignedInPerson } from "./signed-in-person";

export type NoSessionScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  entries: readonly ActionEntry[];
  signOut: () => void;
  openCashSession: (openingFloat: number) => Promise<OpenCashSessionOutcome>;
};

export function NoSessionScreen({
  person,
  registerName,
  entries,
  signOut,
  openCashSession,
}: NoSessionScreenProps) {
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="flex h-screen w-screen bg-surface">
      <NavigationRail
        firstName={person.first_name}
        entries={entriesFor(entries, person.abilities)}
        onSignOut={() => setLeaving(true)}
      />
      <main className="flex flex-1 flex-col gap-1.5 p-8">
        <SessionEyebrow registerName={registerName} />
        <h1 className="text-display text-text-accent">¿Qué querés hacer?</h1>
      </main>
      <CashOpeningPanel
        firstName={person.first_name}
        canOpen={person.abilities.includes("open_cash_session")}
        open={openCashSession}
      />
      <SignOutModal
        open={leaving}
        firstName={person.first_name}
        onClose={() => setLeaving(false)}
        onSignOut={signOut}
      />
    </div>
  );
}
