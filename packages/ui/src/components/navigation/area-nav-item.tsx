import { NavItem, type NavItemLook, type NavItemProps } from "./nav-item";

export type AreaNavItemProps = NavItemProps;

const look: NavItemLook = {
  container:
    "flex w-15 flex-col items-center justify-center gap-1 rounded-lg px-0 py-2 outline-none " +
    "focus-visible:focus-ring-inverse",
  iconSize: "lg",
  inactive: {
    container: "",
    icon: "text-text-inverse-subtle",
    label: "text-caption text-text-inverse-subtle",
  },
  active: {
    container: "bg-surface-nav-subtle",
    icon: "text-text-inverse",
    label: "text-caption font-bold text-text-inverse",
  },
};

export function AreaNavItem(props: AreaNavItemProps) {
  return <NavItem {...props} look={look} />;
}
