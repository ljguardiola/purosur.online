import type { ReactNode } from "react";
import { Keycap } from "../data-display/keycap";
import { escapeKeycapButtonClassName } from "../shared/close-button";
import { type Icon, iconSlotClassName } from "../shared/icon";
import { IconOnlyButton } from "../shared/icon-only-button";
import { type Tone, toneClassName } from "../shared/tone";
import { Eyebrow } from "./eyebrow";

export type ElevatedPanelProps = {
  eyebrow: string;
  title: string;
  icon: Icon;
  tone?: Extract<Tone, "info" | "error">;
  escapeKey?: { name: string; onPress: () => void };
  children: ReactNode;
};

export function ElevatedPanel({
  eyebrow,
  title,
  icon,
  tone = "info",
  escapeKey,
  children,
}: ElevatedPanelProps) {
  return (
    <div className="flex flex-col gap-5 rounded-lg bg-surface p-6 shadow-lg">
      <div className="flex flex-col gap-1">
        <Eyebrow text={eyebrow} />
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`flex size-9 shrink-0 items-center justify-center rounded-full ${toneClassName[tone].surface}`}
          >
            <span className={iconSlotClassName.md}>{icon}</span>
          </span>
          <h1 className="min-w-0 flex-1 text-heading text-text">{title}</h1>
          {escapeKey === undefined ? null : (
            <IconOnlyButton
              name={escapeKey.name}
              onPress={escapeKey.onPress}
              className={escapeKeycapButtonClassName}
            >
              <Keycap keyName="Escape" />
            </IconOnlyButton>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}
