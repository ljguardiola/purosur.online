import {
  Bell,
  Boxes,
  ChartColumn,
  ClipboardList,
  Flag,
  HelpCircle,
  Landmark,
  Tag,
  Users,
} from "lucide-react";
import type { ReactElement } from "react";

type Icon = ReactElement<{ className?: string }>;

const registry: Record<string, Icon> = {
  flag: <Flag />,
  tag: <Tag />,
  boxes: <Boxes />,
  "clipboard-list": <ClipboardList />,
  landmark: <Landmark />,
  "chart-column": <ChartColumn />,
  users: <Users />,
  bell: <Bell />,
};

const fallback = <HelpCircle />;

/** The icon a help category's `icon` name resolves to, or a generic fallback for none/unknown. */
export function sectionIcon(name: string | undefined): Icon {
  return name !== undefined && Object.hasOwn(registry, name)
    ? (registry[name] ?? fallback)
    : fallback;
}
