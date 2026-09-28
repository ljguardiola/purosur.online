import type { AnchorHTMLAttributes } from "react";
import { type Icon, iconSlotClassName } from "../shared/icon";

export type NavItemProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> & {
  label: string;
  icon: Icon;
  active: boolean;
};

type NavItemStateStyle = { container: string; icon: string; label: string };

export type NavItemStyle = {
  container: string;
  iconSize: keyof typeof iconSlotClassName;
  active: NavItemStateStyle;
  inactive: NavItemStateStyle;
};

export function NavItem({
  style,
  label,
  icon,
  active,
  ...props
}: NavItemProps & { style: NavItemStyle }) {
  const state = active ? style.active : style.inactive;
  return (
    <a
      {...props}
      aria-current={active ? "page" : undefined}
      className={`${style.container} ${state.container}`}
    >
      <span aria-hidden="true" className={`${iconSlotClassName[style.iconSize]} ${state.icon}`}>
        {icon}
      </span>
      <span className={state.label}>{label}</span>
    </a>
  );
}
