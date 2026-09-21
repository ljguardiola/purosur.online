import { Flag, HelpCircle } from "lucide-react";
import type { ReactElement } from "react";

// Matches AreaNavItem/SectionNavItem's own icon prop type in @purosur/ui: a lucide icon accepts a
// className prop, and this registry only ever feeds that prop.
type Icon = ReactElement<{ className?: string }>;

// A help category names its icon by a plain string (see Category.icon in @purosur/ui's help
// catalog), so it stays free of any icon library's own import in a data-only module. Each later
// feature that adds a category with an icon registers that icon's name here, next to the ones
// already drawn.
const registry: Record<string, Icon> = {
  flag: <Flag />,
};

const fallback = <HelpCircle />;

/** The icon a help category's `icon` name resolves to, or a generic fallback for none/unknown. */
export function sectionIcon(name: string | undefined): Icon {
  return (name ? registry[name] : undefined) ?? fallback;
}
