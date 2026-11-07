import type { RegisterPointOfSaleSectionProps } from "../../platform/register-point-of-sale-section";

export function RegisterPointOfSaleSectionStub({ registerId }: RegisterPointOfSaleSectionProps) {
  return <p>{`Punto de venta de ${registerId}`}</p>;
}
