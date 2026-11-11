import { ConfirmationPanel } from "@purosur/ui";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { House, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useKeys } from "../platform/key-layer";
import type { ActionEntry } from "./action-entries";
import { ACTION_ENTRIES, entriesFor } from "./action-entries";
import { useRefuseBarcodeReadings } from "./barcode-readings";
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
  const panel = useRef<HTMLDivElement>(null);
  useKeys([{ key: "Escape", run: () => void navigate({ to: "/" }), enabled: !atHome }], {
    fallback: true,
  });
  function pressEnter() {
    const focused = document.activeElement;
    if (focused === panel.current) {
      signOut();
    } else if (focused instanceof HTMLButtonElement && panel.current?.contains(focused)) {
      focused.click();
    }
  }
  useKeys(
    [
      { key: "Escape", run: () => setLeaving(false) },
      { key: "Enter", run: pressEnter },
    ],
    { modal: true, active: leaving },
  );
  useRefuseBarcodeReadings(leaving);
  useEffect(() => {
    if (leaving) {
      panel.current?.focus();
    }
  }, [leaving]);
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
          <div ref={panel} tabIndex={-1} className="flex h-full outline-none">
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
          </div>
        </FramePanel>
      ) : null}
    </>
  );
}
