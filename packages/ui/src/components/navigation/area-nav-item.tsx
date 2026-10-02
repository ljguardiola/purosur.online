import { NavItem, type NavItemLook, type NavItemProps } from "./nav-item";

export type AreaNavRail = "dark" | "light";

export type AreaNavItemProps = NavItemProps & { rail?: AreaNavRail };

export const areaNavLook: Record<AreaNavRail, NavItemLook> = {
  dark: {
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
  },
  // The register is driven by touch, so its rail items are larger than the backoffice's.
  light: {
    container:
      "flex w-18 flex-col items-center justify-center gap-1 rounded-lg px-0 py-3 outline-none " +
      "transition-colors focus-visible:focus-ring",
    iconSize: "xl",
    inactive: {
      container: "hover:bg-surface-subtle",
      icon: "text-text-subtle",
      label: "text-caption text-text-subtle",
    },
    active: {
      container: "bg-action-subtle",
      icon: "text-text-accent",
      label: "text-caption font-bold text-text-accent",
    },
  },
};

export function AreaNavItem({ rail = "dark", ...props }: AreaNavItemProps) {
  return <NavItem {...props} look={areaNavLook[rail]} />;
}
