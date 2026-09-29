import type { AnchorHTMLAttributes } from "react";
import { type Icon, iconSlotClassName } from "../shared/icon";

export type NavItemProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> & {
  label: string;
  icon: Icon;
  active: boolean;
};

type NavItemStateLook = { container: string; icon: string; label: string };

export type NavItemLook = {
  container: string;
  iconSize: keyof typeof iconSlotClassName;
  active: NavItemStateLook;
  inactive: NavItemStateLook;
};

export function NavItem({
  look,
  label,
  icon,
  active,
  ...props
}: NavItemProps & { look: NavItemLook }) {
  const state = active ? look.active : look.inactive;
  return (
    <a
      {...props}
      aria-current={active ? "page" : undefined}
      className={`${look.container} ${state.container}`}
    >
      <span aria-hidden="true" className={`${iconSlotClassName[look.iconSize]} ${state.icon}`}>
        {icon}
      </span>
      <span className={state.label}>{label}</span>
    </a>
  );
}
