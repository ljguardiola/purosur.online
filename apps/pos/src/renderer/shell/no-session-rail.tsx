import { ConfirmationPanel } from "@purosur/ui";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { House, LogOut } from "lucide-react";
import { useState } from "react";
import { useKeys } from "../platform/key-layer";
import type { ActionEntry } from "./action-entries";
import { ACTION_ENTRIES, entriesFor } from "./action-entries";
import { NavigationRail } from "./navigation-rail";
import { FramePanel } from "./register-frame";
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
  const navigate = useNavigate();
  const atHome = useLocation({ select: ({ pathname }) => pathname === "/" });
  const [leaving, setLeaving] = useState(false);
  useKeys([{ key: "Escape", run: () => void navigate({ to: "/" }), enabled: !atHome }], {
    fallback: true,
  });
  useKeys(
    [
      { key: "Escape", run: () => setLeaving(false) },
      { key: "Enter", run: signOut },
    ],
    { modal: true, active: leaving },
  );
  return (
    <>
      <NavigationRail
        entries={entriesFor(ACTION_ENTRIES, person.abilities)}
        {...(current === undefined
          ? {}
          : { current, home: { label: "Inicio", icon: House, to: "/" as const } })}
        onSignOut={() => setLeaving(true)}
        signOutActive={leaving}
      />
      {leaving ? (
        <FramePanel>
          <ConfirmationPanel
            title="¿Salir de la caja?"
            icon={<LogOut />}
            fieldLabel="Persona"
            value={person.first_name}
            actionLabel="Salir"
            actionIcon={<LogOut />}
            onClose={() => setLeaving(false)}
            onConfirm={signOut}
          />
        </FramePanel>
      ) : null}
    </>
  );
}
