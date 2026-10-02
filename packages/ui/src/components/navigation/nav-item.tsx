import type { AnchorHTMLAttributes } from "react";
import { type Icon, iconSlotClassName } from "../shared/icon";

type NavItemContentProps = {
  label: string;
  icon: Icon;
  active: boolean;
};

export type NavItemProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> &
  NavItemContentProps;

export type NavButtonProps = NavItemContentProps & { onPress: () => void };

type NavItemStateLook = { container: string; icon: string; label: string };

export type NavItemLook = {
  container: string;
  iconSize: keyof typeof iconSlotClassName;
  active: NavItemStateLook;
  inactive: NavItemStateLook;
};

function stateOf(look: NavItemLook, active: boolean) {
  const state = active ? look.active : look.inactive;
  return {
    "aria-current": active ? ("page" as const) : undefined,
    className: `${look.container} ${state.container}`,
    state,
  };
}

function NavItemContent({
  look,
  state,
  label,
  icon,
}: {
  look: NavItemLook;
  state: NavItemStateLook;
  label: string;
  icon: Icon;
}) {
  return (
    <>
      <span aria-hidden="true" className={`${iconSlotClassName[look.iconSize]} ${state.icon}`}>
        {icon}
      </span>
      <span className={state.label}>{label}</span>
    </>
  );
}

export function NavItem({
  look,
  label,
  icon,
  active,
  ...props
}: NavItemProps & { look: NavItemLook }) {
  const { state, ...attributes } = stateOf(look, active);
  return (
    <a {...props} {...attributes}>
      <NavItemContent look={look} state={state} label={label} icon={icon} />
    </a>
  );
}

export function NavButton({
  look,
  label,
  icon,
  active,
  onPress,
}: NavButtonProps & { look: NavItemLook }) {
  const { state, ...attributes } = stateOf(look, active);
  return (
    <button type="button" onClick={onPress} {...attributes}>
      <NavItemContent look={look} state={state} label={label} icon={icon} />
    </button>
  );
}
