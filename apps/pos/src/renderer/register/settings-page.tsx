import type { KeyLegendItem, SectionListItem, ToastProps } from "@purosur/ui";
import { ScreenHeader, SectionListCard, ToastStack } from "@purosur/ui";
import type { ReactNode } from "react";
import type { KeyBinding } from "../platform/key-layer";
import { useKeys } from "../platform/key-layer";
import { NoSessionRail } from "../shell/no-session-rail";
import { OpenSessionRail } from "../shell/open-session-rail";
import { RegisterFrame } from "../shell/register-frame";
import type { SignedInPerson } from "../shell/signed-in-person";
import type { SettingsSection } from "./settings-sections";

export type SettingsChrome = {
  person: SignedInPerson;
  sessionOpen: boolean;
  signOut: () => void;
  items: readonly SectionListItem[];
  selected: SettingsSection | undefined;
  onSelect: (id: string) => void;
  moveSection: (pressed: string) => void;
};

const SECTIONS_KEY_LABEL = "Apartados";

export function sectionArrows(
  moveSection: (pressed: string) => void,
  label: string = SECTIONS_KEY_LABEL,
): KeyBinding {
  return { key: "ArrowUpDown", label, run: moveSection, whileTyping: true };
}

type SettingsPageProps = {
  chrome: SettingsChrome;
  bindings: readonly KeyBinding[];
  aside?: ReactNode;
  toasts?: readonly (ToastProps & { id: string })[] | undefined;
};

export function SettingsPage({ chrome, bindings, aside, toasts = [] }: SettingsPageProps) {
  const legend: KeyLegendItem[] = useKeys(bindings);
  const { person, sessionOpen, signOut, items, selected, onSelect } = chrome;
  return (
    <RegisterFrame
      background="subtle"
      rail={
        sessionOpen ? (
          <OpenSessionRail lock={signOut} current="settings" abilities={person.abilities} />
        ) : (
          <NoSessionRail person={person} current="/settings" signOut={signOut} />
        )
      }
      aside={aside}
    >
      <main className="flex min-w-0 flex-1 flex-col gap-4 px-8 pt-4 pb-6">
        <ScreenHeader title="Configuración" />
        <ToastStack toasts={toasts}>
          <SectionListCard
            title="APARTADOS"
            items={items}
            selectedId={selected}
            onSelect={onSelect}
            legend={legend}
          />
        </ToastStack>
      </main>
    </RegisterFrame>
  );
}
