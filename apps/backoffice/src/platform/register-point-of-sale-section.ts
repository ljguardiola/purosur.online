import type { ComponentType } from "react";

export type RegisterPointOfSaleSectionProps = {
  registerId: string;
  onSessionEnded: () => void;
  onSaved: () => void;
};

export type RegisterPointOfSaleSection = ComponentType<RegisterPointOfSaleSectionProps>;
