import type { ComponentType } from "react";

export type RegisterPointOfSaleSectionProps = {
  registerId: string;
  onSessionEnded: () => void;
};

export type RegisterPointOfSaleSection = ComponentType<RegisterPointOfSaleSectionProps>;
