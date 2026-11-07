import type { RegisterPointOfSaleSectionProps } from "../../platform/register-point-of-sale-section";

export function RegisterPointOfSaleSectionStub({
  registerId,
  onSaved,
}: RegisterPointOfSaleSectionProps) {
  return (
    <>
      <p>{`Punto de venta de ${registerId}`}</p>
      <button type="button" onClick={onSaved}>
        Guardar el punto de venta
      </button>
    </>
  );
}
