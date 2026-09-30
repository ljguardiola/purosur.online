import type { SignedInPerson } from "../access/signed-in-person";
import { NavigationRail } from "./navigation-rail";
import { SessionEyebrow } from "./session-eyebrow";

export function SignedInScreen({ person }: { person: SignedInPerson }) {
  return (
    <div className="flex h-screen w-screen bg-surface">
      <NavigationRail firstName={person.first_name} />
      <main className="flex flex-1 flex-col gap-1.5 p-8">
        <SessionEyebrow />
        <h1 className="text-display text-text-accent">¿Qué querés hacer?</h1>
      </main>
    </div>
  );
}
