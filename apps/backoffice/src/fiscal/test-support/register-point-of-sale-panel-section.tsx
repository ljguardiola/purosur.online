import type { RegisterPointOfSaleSectionProps } from "../../platform/register-point-of-sale-section";
import {
  RegisterPointOfSalePanelSection,
  type RegisterPointOfSalePanelSectionServices,
} from "../register-point-of-sale-panel-section";

export function registerPointOfSaleSectionWith(services: RegisterPointOfSalePanelSectionServices) {
  return function RegisterPointOfSaleSectionWithServices(props: RegisterPointOfSaleSectionProps) {
    return <RegisterPointOfSalePanelSection {...props} services={services} />;
  };
}
