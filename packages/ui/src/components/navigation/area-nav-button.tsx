import { type AreaNavRail, areaNavLook } from "./area-nav-item";
import { NavButton, type NavButtonProps } from "./nav-item";

export type AreaNavButtonProps = NavButtonProps & { rail?: AreaNavRail };

export function AreaNavButton({ rail = "dark", ...props }: AreaNavButtonProps) {
  return <NavButton {...props} look={areaNavLook[rail]} />;
}
