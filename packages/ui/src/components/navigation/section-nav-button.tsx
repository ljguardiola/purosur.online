import { NavButton, type NavButtonProps } from "./nav-item";
import { sectionNavLook } from "./section-nav-item";

export type SectionNavButtonProps = NavButtonProps;

export function SectionNavButton(props: SectionNavButtonProps) {
  return <NavButton {...props} look={sectionNavLook} />;
}
