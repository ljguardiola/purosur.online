import { NavItem, type NavItemLook, type NavItemProps } from "./nav-item";

export type SectionNavItemProps = NavItemProps;

const look: NavItemLook = {
  container:
    "flex h-control-lg w-full items-center gap-2 rounded-lg px-2 outline-none transition-colors " +
    "focus-visible:focus-ring-tight",
  iconSize: "md",
  inactive: {
    container: "hover:bg-surface-subtle",
    icon: "text-text-subtle",
    label: "text-detail text-text",
  },
  active: {
    container: "bg-action-subtle",
    icon: "text-text-accent",
    label: "text-body font-bold text-text-accent",
  },
};

export function SectionNavItem(props: SectionNavItemProps) {
  return <NavItem {...props} look={look} />;
}
