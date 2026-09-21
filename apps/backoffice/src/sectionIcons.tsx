import { Flag, HelpCircle } from "lucide-react";
import type { ReactElement } from "react";

type Icon = ReactElement<{ className?: string }>;

const registry: Record<string, Icon> = {
  flag: <Flag />,
};

const fallback = <HelpCircle />;

/** The icon a help category's `icon` name resolves to, or a generic fallback for none/unknown. */
export function sectionIcon(name: string | undefined): Icon {
  return (name ? registry[name] : undefined) ?? fallback;
}
